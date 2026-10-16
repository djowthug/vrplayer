// js/utils/video-profile.js
// Gerenciador de Perfis de Vídeo e Progresso de Reprodução no Frontend com Persistência Híbrida

const STORAGE_KEY = 'vrplayer_video_profiles_v1';
const SAVE_INTERVAL_MS = 3000; // Salva progresso no máximo a cada 3 segundos

export class VideoProfileManager {
  constructor() {
    this.cache = this._loadLocal();
    this.lastTimeSave = 0;
    this.syncTimeout = null;
  }

  // Gera um ID único resistente a mudança de pasta (baseado no nome + tamanho ou path)
  getVideoKey(videoItem) {
    if (!videoItem) return null;
    const rawPath = videoItem.name || videoItem.title || videoItem.url || '';
    const name = rawPath.split(/[/\\]/).pop();
    const size = videoItem.size || videoItem.sizeBytes || 0;
    return `${name}_${size}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  _loadLocal() {
    try {
      if (typeof localStorage === 'undefined') return {};
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('vrp:video_profiles');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  _saveLocal() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
      }
    } catch (e) {
      console.warn('Limite de localStorage atingido, limpando entradas antigas...', e);
      this._pruneOldEntries();
    }
  }

  // Sincroniza perfis do servidor Node.js ou Electron ao abrir o app (multi-dispositivo PC <-> Celular/Quest)
  async syncFromServer() {
    try {
      let serverProfiles = null;

      if (typeof window !== 'undefined' && window.electronAPI?.profiles?.getAll) {
        serverProfiles = await window.electronAPI.profiles.getAll();
      } else if (typeof fetch === 'function') {
        const res = await fetch('/api/profiles');
        if (!res.ok) return;
        serverProfiles = await res.json();
      }

      if (!serverProfiles || typeof serverProfiles !== 'object') return;

      // Mescla priorizando o registro mais recente (updatedAt)
      for (const [key, remote] of Object.entries(serverProfiles)) {
        const local = this.cache[key];
        if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
          this.cache[key] = remote;
        }
      }
      this._saveLocal();
    } catch {
      // Modo offline ou arquivo local direto sem servidor ativo
    }
  }

  // Retorna os dados salvos (tempo e ajustes de shader/projeção)
  get(videoItem) {
    const key = this.getVideoKey(videoItem);
    if (key && this.cache[key]) return this.cache[key];
    if (videoItem) {
      const rawPath = videoItem.name || videoItem.title || videoItem.url || '';
      const name = rawPath.split(/[/\\]/).pop();
      const size = Number(videoItem.size || videoItem.sizeBytes) || 0;
      const altKey = `vid_${(name || 'video').trim().replace(/[\\\/]/g, '_').replace(/["':?*<>|]/g, '')}_${size}`;
      if (this.cache[altKey]) return this.cache[altKey];
    }
    return null;
  }

  // Salva o tempo atual (com throttle para rodar suave no evento timeupdate do <video>)
  saveProgress(videoItem, currentTime, duration, force = false) {
    const now = Date.now();
    if (!force && now - this.lastTimeSave < SAVE_INTERVAL_MS) return;
    if (!duration || duration < 10 || isNaN(currentTime)) return;

    this.lastTimeSave = now;
    const key = this.getVideoKey(videoItem);
    if (!key) return;

    const existing = this.cache[key] || {};
    
    // Se faltam menos de 3% ou 10 segundos para acabar, zera o ponto de retomada (considera concluído)
    const isFinished = (currentTime / duration) > 0.97 || (duration - currentTime) < 10;

    this.cache[key] = {
      ...existing,
      currentTime: isFinished ? 0 : Math.floor(currentTime),
      duration: Math.floor(duration),
      completed: isFinished,
      updatedAt: now
    };

    this._saveLocal();
    this._scheduleServerPush(key, this.cache[key]);
  }

  // Salva ajustes finos do vídeo (Projeção, 3D SBS/TB, Exposição, Curvatura, FOV, Pitch)
  saveProfileSettings(videoItem, settingsPatch) {
    const key = this.getVideoKey(videoItem);
    if (!key) return;

    const existing = this.cache[key] || {};
    this.cache[key] = {
      ...existing,
      profile: {
        ...(existing.profile || {}),
        ...settingsPatch
      },
      updatedAt: Date.now()
    };

    this._saveLocal();
    this._scheduleServerPush(key, this.cache[key]);
  }

  // Remove o perfil customizado de um vídeo (botão "Resetar Padrões do Vídeo")
  resetProfile(videoItem) {
    const key = this.getVideoKey(videoItem);
    if (!key || !this.cache[key]) return;
    delete this.cache[key].profile;
    this.cache[key].updatedAt = Date.now();
    this._saveLocal();
    this._scheduleServerPush(key, this.cache[key]);
  }

  _scheduleServerPush(key, data) {
    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      if (typeof window !== 'undefined' && window.electronAPI?.profiles?.save) {
        window.electronAPI.profiles.save(key, data).catch(() => {});
        return;
      }
      if (typeof fetch === 'function') {
        fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, data })
        }).catch(() => {});
      }
    }, 800);
  }

  _pruneOldEntries() {
    const entries = Object.entries(this.cache)
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .slice(0, 300); // Mantém os 300 vídeos mais recentes
    this.cache = Object.fromEntries(entries);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
      } catch {}
    }
  }
}

export const videoProfileManager = new VideoProfileManager();
