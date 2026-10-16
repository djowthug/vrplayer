// Motor de Áudio Espacial Binaural via Web Audio API (HRTF + PannerNode)
// Suporta Ambisonics FOA (4 canais), Surround 5.1 (6 canais) e Estéreo Ancorado (2 canais com head-tracking)

export const SPEAKER_LAYOUTS = {
  // Estéreo ancorado à tela frontal (ideal para VR 180, modo plano e Cinema Curvo)
  'stereo-headtracked': [
    [-1.8, 0.0, -2.5], // Left frontal
    [ 1.8, 0.0, -2.5]  // Right frontal
  ],
  // 4 cantos esféricos para 4 canais / Quad / Ambisonics FOA (W, X, Y, Z)
  'ambisonics-foa': [
    [-2.0,  0.5, -2.0], // Front-Left
    [ 2.0,  0.5, -2.0], // Front-Right
    [-2.0, -0.5,  2.0], // Rear-Left
    [ 2.0, -0.5,  2.0]  // Rear-Right
  ],
  // Surround 5.1 completo na sala de cinema virtual (L, R, C, LFE, SL, SR)
  'surround-5.1': [
    [-2.2,  0.0, -2.5], // Front Left
    [ 2.2,  0.0, -2.5], // Front Right
    [ 0.0,  0.0, -3.0], // Center (Vozes na tela)
    [ 0.0, -1.0, -2.0], // LFE (Subwoofer)
    [-2.8,  0.0,  1.2], // Surround Left
    [ 2.8,  0.0,  1.2]  // Surround Right
  ]
};

/**
 * Aplica rotação de quaternion (qx, qy, qz, qw) a um vetor 3D (vx, vy, vz).
 * Implementação pura sem dependência externa, equivalente a Three.js Vector3.applyQuaternion.
 */
export function rotateVectorByQuaternion(qx, qy, qz, qw, vx, vy, vz) {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  };
}

export class SpatialAudioEngine {
  constructor(videoElement) {
    this.video = videoElement;
    this.ctx = null;
    this.source = null;
    this.splitter = null;
    this.panners = [];
    this.dryGain = null;
    this.wetGain = null;
    this.enabled = false;
    this.mode = 'none'; // 'ambisonics-foa' | 'surround-5.1' | 'stereo-headtracked' | 'none'
  }

  /**
   * Inicializa o grafo de áudio Web Audio API (apenas uma vez para o elemento de vídeo).
   * @param {AudioContext} [externalCtx]
   * @param {MediaElementAudioSourceNode} [externalSource]
   */
  init(externalCtx = null, externalSource = null) {
    if (this.ctx) return;
    if (typeof window === 'undefined') return;

    try {
      if (externalCtx && externalSource) {
        this.ctx = externalCtx;
        this.source = externalSource;
      } else if (this.video && this.video._webaudioCtx && this.video._webaudioSource) {
        this.ctx = this.video._webaudioCtx;
        this.source = this.video._webaudioSource;
      } else {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          console.warn('[SpatialAudio] Web Audio API não suportada neste navegador.');
          return;
        }
        this.ctx = new AudioCtx();
        this.source = this.ctx.createMediaElementSource(this.video);
        if (this.video) {
          this.video._webaudioCtx = this.ctx;
          this.video._webaudioSource = this.source;
        }
      }

      this.dryGain = this.ctx.createGain();
      this.wetGain = this.ctx.createGain();

      // Bypass (áudio normal) ativo por padrão
      this.source.connect(this.dryGain);
      this.dryGain.connect(this.ctx.destination);
      this.wetGain.connect(this.ctx.destination);

      this.dryGain.gain.value = 1;
      this.wetGain.gain.value = 0;
    } catch (e) {
      console.warn('[SpatialAudio] Falha ao inicializar AudioContext:', e.message);
    }
  }

  /**
   * Configura o modo e ativa/desativa o processamento espacial.
   * @param {string} mode - 'stereo-headtracked' | 'ambisonics-foa' | 'surround-5.1' | 'none'
   * @param {boolean} enabled - Se o áudio espacial 3D está ativo
   */
  configure(mode = 'stereo-headtracked', enabled = true) {
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.mode = mode;
    this.enabled = !!enabled;

    // Limpa nós de panner anteriores
    this.clearPanners();

    if (!enabled || mode === 'none') {
      if (this.dryGain) this.dryGain.gain.value = 1;
      if (this.wetGain) this.wetGain.gain.value = 0;
      return;
    }

    if (this.dryGain) this.dryGain.gain.value = 0;
    if (this.wetGain) this.wetGain.gain.value = 1;

    const positions = SPEAKER_LAYOUTS[mode] || SPEAKER_LAYOUTS['stereo-headtracked'];
    const numChannels = positions.length;

    try {
      this.splitter = this.ctx.createChannelSplitter(numChannels);
      this.source.connect(this.splitter);

      positions.forEach(([x, y, z], index) => {
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF'; // Filtro binaural anatômico de orelha humana
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 1;

        if (panner.positionX) {
          panner.positionX.value = x;
          panner.positionY.value = y;
          panner.positionZ.value = z;
        } else if (typeof panner.setPosition === 'function') {
          panner.setPosition(x, y, z);
        }

        this.splitter.connect(panner, index);
        panner.connect(this.wetGain);
        this.panners.push(panner);
      });
    } catch (err) {
      console.error('[SpatialAudio] Erro ao configurar panners HRTF:', err);
      // Fallback para dry em caso de erro no hardware de áudio
      if (this.dryGain) this.dryGain.gain.value = 1;
      if (this.wetGain) this.wetGain.gain.value = 0;
    }
  }

  /**
   * Chamado no loop de animação (renderer.js) passando a câmera Three.js
   * @param {object} camera - Objeto com propriedade quaternion
   */
  updateListenerFromCamera(camera) {
    if (!this.ctx || !this.enabled || !camera) return;

    const listener = this.ctx.listener;
    if (!listener) return;

    const q = camera.quaternion;
    if (!q) return;

    // Forward padrão é (0, 0, -1) e Up padrão é (0, 1, 0)
    const forward = rotateVectorByQuaternion(q.x, q.y, q.z, q.w, 0, 0, -1);
    const up = rotateVectorByQuaternion(q.x, q.y, q.z, q.w, 0, 1, 0);

    if (listener.forwardX) {
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    } else if (typeof listener.setOrientation === 'function') {
      // Fallback para versões mais antigas do Safari iOS
      listener.setOrientation(
        forward.x,
        forward.y,
        forward.z,
        up.x,
        up.y,
        up.z
      );
    }
  }

  /**
   * Desconecta os nós de panner e o splitter da cadeia de áudio.
   */
  clearPanners() {
    if (this.splitter) {
      try {
        this.source.disconnect(this.splitter);
      } catch {}
      try {
        this.splitter.disconnect();
      } catch {}
      this.splitter = null;
    }
    this.panners.forEach((p) => {
      try {
        p.disconnect();
      } catch {}
    });
    this.panners = [];
  }

  /**
   * Libera recursos ao fechar o player.
   */
  destroy() {
    this.clearPanners();
    if (this.source) {
      try { this.source.disconnect(); } catch {}
    }
    if (this.dryGain) {
      try { this.dryGain.disconnect(); } catch {}
    }
    if (this.wetGain) {
      try { this.wetGain.disconnect(); } catch {}
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      try { this.ctx.close(); } catch {}
    }
    this.ctx = null;
    this.source = null;
    this.enabled = false;
  }
}
