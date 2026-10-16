// Módulo de Gerenciamento de Perfis de Vídeo e Retomada Automática (Persistência Híbrida)
// Sincroniza LocalStorage com o backend (video-profiles.json via REST ou Electron IPC).

const STORAGE_PROFILES_KEY = 'vrp:video_profiles';
let saveDebounceTimer = null;
let pendingSaves = new Map();

/**
 * Gera a chave única normalizada para o vídeo: vid_nome_tamanho
 */
export function generateVideoKey(name, sizeBytes = 0) {
  const safeName = (name || 'video')
    .trim()
    .replace(/[\\\/]/g, '_')
    .replace(/["':?*<>|]/g, '');
  const safeSize = Number(sizeBytes) || 0;
  return `vid_${safeName}_${safeSize}`;
}

/**
 * Obtém todos os perfis do cache do LocalStorage
 */
export function getLocalProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Salva todos os perfis no LocalStorage
 */
export function setLocalProfiles(profiles) {
  try {
    localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles || {}));
  } catch {
    /* Armazenamento cheio ou bloqueado pelo navegador */
  }
}

/**
 * Migra dados legados (fmt: e prog:) para a nova estrutura de perfis
 */
export function migrateLegacyProfiles() {
  try {
    const profiles = getLocalProfiles();
    let migrated = false;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('vrp:')) continue;
      const subKey = k.slice(4);

      if (subKey.startsWith('prog:')) {
        const parts = subKey.slice(5).split(':');
        const name = parts[0];
        const size = parseInt(parts[1], 10) || 0;
        const vKey = generateVideoKey(name, size);

        if (!profiles[vKey]) {
          try {
            const p = JSON.parse(localStorage.getItem(k));
            if (p && typeof p.time === 'number') {
              profiles[vKey] = {
                currentTime: p.time,
                duration: p.duration || 0,
                completed: !!p.completed,
                updatedAt: p.updatedAt || Date.now(),
                profile: {},
              };
              migrated = true;
            }
          } catch {}
        }
      } else if (subKey.startsWith('fmt:')) {
        const parts = subKey.slice(4).split(':');
        const name = parts[0];
        const size = parseInt(parts[1], 10) || 0;
        const vKey = generateVideoKey(name, size);

        try {
          const f = JSON.parse(localStorage.getItem(k));
          if (f && f.projection) {
            if (!profiles[vKey]) {
              profiles[vKey] = {
                currentTime: 0,
                duration: 0,
                completed: false,
                updatedAt: Date.now(),
                profile: {},
              };
            }
            profiles[vKey].profile = {
              ...(profiles[vKey].profile || {}),
              projection: f.projection,
              stereo: f.layout || 'mono',
              swap: !!f.swap,
              ...(f.fisheye ? {
                fisheyeFov: f.fisheye.fov,
                fisheyeScale: f.fisheye.scale,
              } : {}),
            };
            migrated = true;
          }
        } catch {}
      }
    }

    if (migrated) {
      setLocalProfiles(profiles);
    }
    return profiles;
  } catch {
    return getLocalProfiles();
  }
}

/**
 * Sincroniza perfis com o backend (Electron IPC ou REST no server.js).
 * Usa estratégia Last-Write-Wins baseada em updatedAt.
 */
export async function syncProfilesWithBackend(serverUrl = '') {
  migrateLegacyProfiles();
  const local = getLocalProfiles();
  const isElectron = !!(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.profilesGetAll);

  let remote = {};
  try {
    if (isElectron) {
      remote = (await window.electronAPI.profilesGetAll()) || {};
    } else if (serverUrl) {
      const res = await fetch(`${serverUrl}/api/profiles`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        remote = data.profiles || {};
      }
    }
  } catch {
    return local;
  }

  // Mesclagem inteligente
  const merged = { ...local };
  const toSendToRemote = {};

  for (const [key, remEntry] of Object.entries(remote)) {
    if (!remEntry) continue;
    const locEntry = merged[key];
    if (!locEntry) {
      merged[key] = remEntry;
    } else {
      const locTime = locEntry.updatedAt || 0;
      const remTime = remEntry.updatedAt || 0;
      if (remTime > locTime) {
        merged[key] = remEntry;
      } else if (locTime > remTime) {
        toSendToRemote[key] = locEntry;
      }
    }
  }

  // Verifica chaves locais que não existem no remoto
  for (const [key, locEntry] of Object.entries(local)) {
    if (!remote[key]) {
      toSendToRemote[key] = locEntry;
    }
  }

  setLocalProfiles(merged);

  // Envia entradas locais pendentes para o servidor
  if (Object.keys(toSendToRemote).length > 0) {
    try {
      if (isElectron && window.electronAPI.profilesSave) {
        for (const [k, v] of Object.entries(toSendToRemote)) {
          await window.electronAPI.profilesSave(k, v);
        }
      } else if (serverUrl) {
        await fetch(`${serverUrl}/api/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profiles: toSendToRemote }),
        });
      }
    } catch {}
  }

  return merged;
}

/**
 * Obtém o perfil de um vídeo (cache local primeiro, sincronização leve com backend se online)
 */
export async function loadVideoProfile(key, serverUrl = '') {
  if (!key) return null;
  const local = getLocalProfiles();
  const cached = local[key] || null;

  const isElectron = !!(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.profilesGet);
  if (isElectron) {
    try {
      const rem = await window.electronAPI.profilesGet(key);
      if (rem && (!cached || (rem.updatedAt || 0) > (cached.updatedAt || 0))) {
        local[key] = rem;
        setLocalProfiles(local);
        return rem;
      }
    } catch {}
  } else if (serverUrl) {
    try {
      const res = await fetch(`${serverUrl}/api/profiles?key=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          const rem = data.profile;
          if (!cached || (rem.updatedAt || 0) > (cached.updatedAt || 0)) {
            local[key] = rem;
            setLocalProfiles(local);
            return rem;
          }
        }
      }
    } catch {}
  }

  return cached;
}

/**
 * Salva o progresso e perfil do vídeo.
 * Imediatamente no LocalStorage, com debounce no envio para o backend.
 */
export function saveVideoProfile({
  key,
  currentTime,
  duration,
  completed,
  profile,
  serverUrl = '',
  immediate = false,
}) {
  if (!key) return;
  const local = getLocalProfiles();
  const existing = local[key] || {};

  const curTime = typeof currentTime === 'number' && !isNaN(currentTime)
    ? Number(currentTime.toFixed(2))
    : (existing.currentTime || 0);

  const dur = typeof duration === 'number' && !isNaN(duration)
    ? Number(duration.toFixed(2))
    : (existing.duration || 0);

  const isCompleted = typeof completed === 'boolean'
    ? completed
    : (dur > 0 ? (curTime >= dur - 10 || (curTime / dur) >= 0.92) : false);

  const mergedProfile = {
    ...(existing.profile || {}),
    ...(profile || {}),
  };

  const updatedEntry = {
    ...existing,
    currentTime: curTime,
    duration: dur,
    completed: isCompleted,
    updatedAt: Date.now(),
    profile: mergedProfile,
  };

  local[key] = updatedEntry;
  setLocalProfiles(local);
  pendingSaves.set(key, updatedEntry);

  const isElectron = !!(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.profilesSave);

  const flush = async () => {
    if (pendingSaves.size === 0) return;
    const toFlush = new Map(pendingSaves);
    pendingSaves.clear();

    for (const [k, v] of toFlush.entries()) {
      try {
        if (isElectron) {
          await window.electronAPI.profilesSave(k, v);
        } else if (serverUrl) {
          await fetch(`${serverUrl}/api/profiles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: k, data: v }),
            keepalive: true,
          });
        }
      } catch {}
    }
  };

  if (immediate) {
    clearTimeout(saveDebounceTimer);
    flush();
  } else {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(flush, 4500);
  }
}

/**
 * Extrai o estado atual de formato, shaders e calibração para compor o perfil
 */
export function extractProfileFromState(state, look, vr, spatialAudio) {
  if (!state) return {};
  const f = state.format || {};
  const img = state.image || {};
  const fe = state.fisheye || {};
  const cin = state.cinema || {};

  return {
    projection: f.projection || '360',
    stereo: f.layout || 'mono',
    swap: !!f.swap,
    fisheyeFov: fe.fov || 180,
    fisheyeScale: fe.scale || 1.0,
    curvature: cin.curvature !== undefined ? cin.curvature : 0.35,
    distance: cin.distance !== undefined ? cin.distance : 2.8,
    scale: cin.scale !== undefined ? cin.scale : 1.0,
    exposure: img.exposure || 0,
    brightness: img.brightness || 0,
    contrast: img.contrast !== undefined ? img.contrast : 1.0,
    saturation: img.saturation !== undefined ? img.saturation : 1.0,
    gamma: img.gamma !== undefined ? img.gamma : 1.0,
    pitchOffset: look && typeof look.getPitchOffsetDeg === 'function' ? look.getPitchOffsetDeg() : 0,
    spatialAudio: spatialAudio?.enabled ? (state.audioSpatialType || 'stereo-headtracked') : 'none',
    dominantEye: state.dominantEye || 'both',
  };
}

/**
 * Aplica um perfil salvo ao estado do aplicativo e aos motores 3D / shaders
 */
export function applyProfileToState(profileData, state, vr, look, spatialAudio, cbs = {}) {
  if (!profileData || !state) return false;
  const p = profileData.profile || profileData;
  let applied = false;

  // 1. Projeção e Formato
  if (p.projection || p.stereo) {
    state.format = {
      projection: p.projection || state.format.projection || '360',
      layout: p.stereo || p.layout || state.format.layout || 'mono',
      swap: typeof p.swap === 'boolean' ? p.swap : !!state.format.swap,
    };
    if (vr) vr.setFormat(state.format);
    applied = true;
  }

  // 2. Olho de Peixe (Fisheye)
  if (p.fisheyeFov || p.fisheyeScale) {
    state.fisheye = {
      fov: typeof p.fisheyeFov === 'number' ? p.fisheyeFov : state.fisheye.fov,
      scale: typeof p.fisheyeScale === 'number' ? p.fisheyeScale : state.fisheye.scale,
    };
    if (vr) vr.setFisheyeSettings(state.fisheye);
    applied = true;
  }

  // 3. Imagem / Shaders WebGL
  if (p.exposure !== undefined || p.brightness !== undefined || p.contrast !== undefined || p.saturation !== undefined || p.gamma !== undefined) {
    state.image = {
      exposure: p.exposure !== undefined ? p.exposure : state.image.exposure,
      brightness: p.brightness !== undefined ? p.brightness : state.image.brightness,
      contrast: p.contrast !== undefined ? p.contrast : state.image.contrast,
      saturation: p.saturation !== undefined ? p.saturation : state.image.saturation,
      gamma: p.gamma !== undefined ? p.gamma : state.image.gamma,
    };
    if (vr) vr.setImage(state.image);
    applied = true;
  }

  // 4. Modo Cinema / Tela Plana
  if (p.curvature !== undefined || p.distance !== undefined || p.scale !== undefined) {
    state.cinema = {
      curvature: p.curvature !== undefined ? p.curvature : state.cinema?.curvature,
      distance: p.distance !== undefined ? p.distance : state.cinema?.distance,
      scale: p.scale !== undefined ? p.scale : state.cinema?.scale,
    };
    if (vr) vr.setCinemaScreen(state.cinema);
    applied = true;
  }

  // 5. Inclinação / Pitch (Modo Deitado)
  if (typeof p.pitchOffset === 'number' && look && typeof look.setPitchOffset === 'function') {
    look.setPitchOffset(p.pitchOffset * (Math.PI / 180));
    applied = true;
  }

  // 6. Olho Dominante
  if (p.dominantEye && typeof cbs.setDominantEye === 'function') {
    cbs.setDominantEye(p.dominantEye, false);
    applied = true;
  }

  // 7. Áudio Espacial
  if (p.spatialAudio && spatialAudio && typeof cbs.setSpatialAudioMode === 'function') {
    if (p.spatialAudio !== 'none') {
      cbs.setSpatialAudioMode(p.spatialAudio, true);
    } else {
      cbs.setSpatialAudioMode('stereo-headtracked', false);
    }
    applied = true;
  }

  // Atualiza controles na interface
  if (typeof cbs.syncSliders === 'function') cbs.syncSliders();
  if (typeof cbs.renderFormatUI === 'function') cbs.renderFormatUI();

  return applied;
}
