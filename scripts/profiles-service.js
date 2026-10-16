// Serviço de Persistência de Perfis e Progresso de Vídeos (video-profiles.json)
// Permite salvar e sincronizar formato, calibração óptica e progresso entre dispositivos.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROFILES_FILE = path.resolve(__dirname, '..', 'video-profiles.json');

let memoryCache = null;
let lastMtime = 0;

/**
 * Gera uma chave única e normalizada para o vídeo baseada em nome e tamanho.
 * Permite mover o vídeo de pasta sem perder o progresso ou os ajustes calibrados.
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
 * Valida e limita os campos numéricos do perfil óptico e de imagem
 */
export function sanitizeProfile(profile = {}) {
  if (!profile || typeof profile !== 'object') return {};

  const clean = {};

  if (typeof profile.projection === 'string') {
    const validProj = ['360', '180', 'fisheye', 'flat'];
    clean.projection = validProj.includes(profile.projection) ? profile.projection : '360';
  }

  if (typeof profile.stereo === 'string') {
    const validStereo = ['mono', 'sbs', 'tb'];
    clean.stereo = validStereo.includes(profile.stereo) ? profile.stereo : 'mono';
  } else if (typeof profile.layout === 'string') {
    const validStereo = ['mono', 'sbs', 'tb'];
    clean.stereo = validStereo.includes(profile.layout) ? profile.layout : 'mono';
  }

  if (typeof profile.swap === 'boolean') {
    clean.swap = profile.swap;
  }

  if (typeof profile.fisheyeFov === 'number' && !isNaN(profile.fisheyeFov)) {
    clean.fisheyeFov = Math.max(150, Math.min(240, Number(profile.fisheyeFov.toFixed(1))));
  }

  if (typeof profile.fisheyeScale === 'number' && !isNaN(profile.fisheyeScale)) {
    clean.fisheyeScale = Math.max(0.7, Math.min(1.4, Number(profile.fisheyeScale.toFixed(3))));
  }

  if (typeof profile.curvature === 'number' && !isNaN(profile.curvature)) {
    clean.curvature = Math.max(0, Math.min(1.0, Number(profile.curvature.toFixed(2))));
  }

  if (typeof profile.distance === 'number' && !isNaN(profile.distance)) {
    clean.distance = Math.max(1.0, Math.min(15.0, Number(profile.distance.toFixed(1))));
  }

  if (typeof profile.scale === 'number' && !isNaN(profile.scale)) {
    clean.scale = Math.max(0.4, Math.min(3.0, Number(profile.scale.toFixed(2))));
  }

  // Sliders de Imagem WebGL
  if (typeof profile.exposure === 'number' && !isNaN(profile.exposure)) {
    clean.exposure = Math.max(-1.5, Math.min(1.5, Number(profile.exposure.toFixed(2))));
  }
  if (typeof profile.brightness === 'number' && !isNaN(profile.brightness)) {
    clean.brightness = Math.max(-0.5, Math.min(0.5, Number(profile.brightness.toFixed(2))));
  }
  if (typeof profile.contrast === 'number' && !isNaN(profile.contrast)) {
    clean.contrast = Math.max(0.4, Math.min(2.0, Number(profile.contrast.toFixed(2))));
  }
  if (typeof profile.saturation === 'number' && !isNaN(profile.saturation)) {
    clean.saturation = Math.max(0.0, Math.min(2.5, Number(profile.saturation.toFixed(2))));
  }
  if (typeof profile.gamma === 'number' && !isNaN(profile.gamma)) {
    clean.gamma = Math.max(0.4, Math.min(2.0, Number(profile.gamma.toFixed(2))));
  }

  // Pitch Offset (Modo Deitado / Reclinar)
  if (typeof profile.pitchOffset === 'number' && !isNaN(profile.pitchOffset)) {
    clean.pitchOffset = Math.max(-80, Math.min(85, Math.round(profile.pitchOffset)));
  }

  // Áudio Espacial
  if (typeof profile.spatialAudio === 'string') {
    clean.spatialAudio = profile.spatialAudio;
  }

  // Olho Dominante
  if (typeof profile.dominantEye === 'string') {
    const validEyes = ['both', 'left', 'right'];
    clean.dominantEye = validEyes.includes(profile.dominantEye) ? profile.dominantEye : 'both';
  }

  return clean;
}

/**
 * Lê todos os perfis salvos no arquivo video-profiles.json
 */
export function loadVideoProfiles(filePath = PROFILES_FILE) {
  try {
    if (!fs.existsSync(filePath)) {
      memoryCache = {};
      lastMtime = 0;
      return {};
    }
    const stat = fs.statSync(filePath);
    if (memoryCache && stat.mtimeMs === lastMtime) {
      return memoryCache;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    memoryCache = JSON.parse(content || '{}');
    lastMtime = stat.mtimeMs;
    return memoryCache;
  } catch (err) {
    console.error('[ProfilesService] Erro ao carregar perfis:', err.message);
    return memoryCache || {};
  }
}

/**
 * Salva com escrita atômica o mapa de perfis no disco
 */
export function saveVideoProfiles(profiles, filePath = PROFILES_FILE) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const jsonStr = JSON.stringify(profiles || {}, null, 2);
    const tmpFile = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, jsonStr, 'utf8');
    fs.renameSync(tmpFile, filePath);
    memoryCache = profiles;
    const stat = fs.statSync(filePath);
    lastMtime = stat.mtimeMs;
    return true;
  } catch (err) {
    console.error('[ProfilesService] Erro ao salvar perfis:', err.message);
    return false;
  }
}

/**
 * Retorna o perfil de um vídeo pela chave normalizada
 */
export function getVideoProfile(key, filePath = PROFILES_FILE) {
  if (!key) return null;
  const profiles = loadVideoProfiles(filePath);
  return profiles[key] || null;
}

/**
 * Atualiza ou insere o perfil/progresso de um vídeo
 */
export function updateVideoProfile(key, data = {}, filePath = PROFILES_FILE) {
  if (!key) throw new Error('Chave de vídeo obrigatória');
  const profiles = { ...loadVideoProfiles(filePath) };
  const existing = profiles[key] || {};

  const curTime = typeof data.currentTime === 'number' && !isNaN(data.currentTime)
    ? Math.max(0, Number(data.currentTime.toFixed(2)))
    : (existing.currentTime || 0);

  const dur = typeof data.duration === 'number' && !isNaN(data.duration)
    ? Math.max(0, Number(data.duration.toFixed(2)))
    : (existing.duration || 0);

  const isCompleted = typeof data.completed === 'boolean'
    ? data.completed
    : (dur > 0 ? (curTime >= dur - 10 || (curTime / dur) >= 0.92) : false);

  const mergedProfile = sanitizeProfile({
    ...(existing.profile || {}),
    ...(data.profile || {}),
  });

  const updatedAt = typeof data.updatedAt === 'number' && data.updatedAt > 0
    ? data.updatedAt
    : Date.now();

  profiles[key] = {
    ...existing,
    currentTime: curTime,
    duration: dur,
    completed: isCompleted,
    updatedAt,
    profile: mergedProfile,
  };

  saveVideoProfiles(profiles, filePath);
  return profiles[key];
}

/**
 * Remove o perfil de um vídeo
 */
export function deleteVideoProfile(key, filePath = PROFILES_FILE) {
  if (!key) return false;
  const profiles = { ...loadVideoProfiles(filePath) };
  if (!profiles[key]) return false;
  delete profiles[key];
  saveVideoProfiles(profiles, filePath);
  return true;
}
