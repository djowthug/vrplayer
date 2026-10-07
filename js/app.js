// VR Player — interface, carregamento de arquivos e estado.
import * as THREE from 'three';
import { VRRenderer } from './renderer.js';
import { LookControls } from './controls.js';
import { analyzeFrame, guessFormat } from './detect.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const els = {
  home: $('home'),
  player: $('player'),
  fileInput: $('file-input'),
  video: $('video'),
  controls: $('controls'),
  title: $('title'),
  bigPlay: $('big-play'),
  btnPlay: $('btn-play'),
  btnMute: $('btn-mute'),
  btnHeadset: $('btn-headset'),
  scrubber: $('scrubber'),
  tCur: $('t-cur'),
  tDur: $('t-dur'),
  formatChip: $('btn-format-chip'),
  backdrop: $('sheet-backdrop'),
  sheetFormat: $('sheet-format'),
  sheetSettings: $('sheet-settings'),
  presets: $('presets'),
  segProjection: $('seg-projection'),
  segLayout: $('seg-layout'),
  swSwap: $('sw-swap'),
  detectCaption: $('detect-caption'),
  hud: $('hud'),
  hudL: $('hud-l'),
  hudR: $('hud-r'),
  toast: $('toast'),
};
const video = els.video;

// ---------------- Armazenamento ----------------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('vrp:' + key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('vrp:' + key, JSON.stringify(value));
    } catch { /* armazenamento cheio ou bloqueado */ }
  },
};

const DEFAULT_IMAGE = { brightness: 0, contrast: 1 };
const DEFAULT_HEADSET = { ipd: 0, fov: 90, distortion: 0.25 };

const PRESETS = [
  { label: '360°', projection: '360', layout: 'mono' },
  { label: '360° 3D', projection: '360', layout: 'tb' },
  { label: 'VR180', projection: '180', layout: 'sbs' },
  { label: 'Olho de peixe', projection: 'fisheye', layout: 'sbs' },
  { label: '3D Plano', projection: 'flat', layout: 'sbs' },
  { label: '2D Plano', projection: 'flat', layout: 'mono' },
];
const PROJ_LABEL = { '360': '360°', '180': '180°', fisheye: 'Olho de peixe', flat: 'Plano' };
const LAYOUT_LABEL = { mono: '', sbs: 'Lado a lado', tb: 'Cima/baixo' };

const SLIDERS = [
  { id: 'sl-brightness', group: 'image', key: 'brightness', min: -0.3, max: 0.3, step: 0.01, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) },
  { id: 'sl-contrast', group: 'image', key: 'contrast', min: 0.6, max: 1.6, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
  { id: 'sl-ipd', group: 'headsetSettings', key: 'ipd', min: -0.15, max: 0.15, step: 0.005, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) },
  { id: 'sl-fov', group: 'headsetSettings', key: 'fov', min: 60, max: 120, step: 1, fmt: (v) => Math.round(v) + '°' },
  { id: 'sl-distortion', group: 'headsetSettings', key: 'distortion', min: 0, max: 0.6, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
];

const state = {
  format: { projection: '360', layout: 'mono', swap: false },
  image: { ...DEFAULT_IMAGE, ...store.get('image', {}) },
  headsetSettings: { ...DEFAULT_HEADSET, ...store.get('headset', {}) },
  headset: false,
  fileName: '',
  fileKey: null,
  objectUrl: null,
  userChangedFormat: false,
  autoAnalyzePending: false,
  gyroAsked: false,
  unlocked: false,
  controlsVisible: true,
  scrubbing: false,
  wakeLock: null,
};

let vr = null;
let look = null;
const viewQ = new THREE.Quaternion();

// ---------------- Motor 3D ----------------
function ensureEngine() {
  if (vr) return;
  vr = new VRRenderer($('stage'), video);
  look = new LookControls($('stage'), () => vr.currentFov());
  look.onTap = handleTap;
  look.onDoubleTap = () => setControlsVisible(true);
  look.onLongPress = () => {
    look.recenter();
    hud('Visão centralizada');
  };
  look.onPinch = (ratio) => {
    if (!state.headset) vr.viewFov = clamp(vr.viewFov / ratio, 30, 110);
  };
  vr.setImage(state.image);
  vr.setHeadsetSettings(state.headsetSettings);

  const onResize = () => vr && vr.resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 300));
}

function startLoop() {
  vr.renderer.setAnimationLoop(() => {
    look.getQuaternion(viewQ);
    vr.render(viewQ);
    updateTimeUI();
  });
}

function stopLoop() {
  vr?.renderer.setAnimationLoop(null);
}

// ---------------- Abrir arquivo ----------------
els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) openFile(file);
});

function waitFor(el, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(reject, new Error('Tempo esgotado ao carregar o vídeo')), timeout);
    const ok = () => done(resolve);
    const err = () => done(reject, new Error('Não foi possível abrir este vídeo'));
    function done(fn, arg) {
      clearTimeout(timer);
      el.removeEventListener(event, ok);
      el.removeEventListener('error', err);
      fn(arg);
    }
    el.addEventListener(event, ok);
    el.addEventListener('error', err);
  });
}

async function openFile(file) {
  ensureEngine();
  releaseVideo();

  state.fileName = file.name;
  state.fileKey = `fmt:${file.name}:${file.size}`;
  state.userChangedFormat = false;
  state.autoAnalyzePending = false;
  els.title.textContent = file.name;

  showPlayer();

  state.objectUrl = URL.createObjectURL(file);
  video.src = state.objectUrl;
  video.load();

  try {
    await waitFor(video, 'loadedmetadata');
  } catch (err) {
    toast('Não foi possível abrir este vídeo. O iPhone suporta MP4/MOV em H.264 ou HEVC.');
    closePlayer();
    return;
  }

  const saved = store.get(state.fileKey);
  if (saved) {
    applyFormat(saved, 'Formato salvo para este vídeo');
  } else {
    const first = guessFormat(file.name, video.videoWidth, video.videoHeight, null);
    applyFormat({ ...first, swap: false }, captionFor(first.source));
    if (first.source !== 'nome') {
      const analysis = await analyzeVideo();
      if (analysis && analysis.valid) {
        refineFromAnalysis(analysis);
      } else {
        // O iOS às vezes só entrega quadros depois do play: tenta de novo ao reproduzir.
        state.autoAnalyzePending = true;
      }
    }
  }

  if (video.videoWidth * video.videoHeight > 6144 * 3072) {
    toast('Vídeo de resolução muito alta: pode travar no iPhone.');
  }
  setControlsVisible(true);
}

async function analyzeVideo() {
  try {
    if (video.readyState < 2) await Promise.race([waitFor(video, 'loadeddata', 2500), sleep(2500)]);
    if (video.readyState < 2) return null;
    const target = Math.min((video.duration || 0) * 0.15, 20);
    if (target > 0.5) {
      video.currentTime = target;
      await Promise.race([waitFor(video, 'seeked', 2500), sleep(2500)]);
    }
    const a = analyzeFrame(video);
    video.currentTime = 0;
    return a;
  } catch {
    return null;
  }
}

function refineFromAnalysis(analysis) {
  if (state.userChangedFormat) return;
  const g = guessFormat(state.fileName, video.videoWidth, video.videoHeight, analysis);
  const changed = g.projection !== state.format.projection || g.layout !== state.format.layout;
  applyFormat({ projection: g.projection, layout: g.layout, swap: state.format.swap }, captionFor(g.source));
  if (changed) toast('Formato detectado: ' + formatLabel(state.format));
}

function captionFor(source) {
  return {
    nome: 'Detectado pelo nome do arquivo',
    imagem: 'Detectado pela imagem do vídeo',
    'proporção': 'Estimado pela proporção do vídeo. Confira se está correto.',
  }[source] || '';
}

function formatLabel(f) {
  const preset = PRESETS.find((p) => p.projection === f.projection && p.layout === f.layout);
  if (preset) return preset.label;
  return [PROJ_LABEL[f.projection], LAYOUT_LABEL[f.layout]].filter(Boolean).join(' · ');
}

// ---------------- Formato ----------------
function applyFormat(fmt, caption) {
  state.format = { projection: fmt.projection, layout: fmt.layout, swap: !!fmt.swap };
  vr.setFormat(state.format);
  if (caption !== undefined) els.detectCaption.textContent = caption;
  renderFormatUI();
}

function userSetFormat(partial) {
  state.userChangedFormat = true;
  state.autoAnalyzePending = false;
  applyFormat({ ...state.format, ...partial }, 'Escolhido manualmente');
  if (state.fileKey) store.set(state.fileKey, state.format);
}

function renderFormatUI() {
  const f = state.format;
  for (const b of els.segProjection.children) b.classList.toggle('active', b.dataset.value === f.projection);
  for (const b of els.segLayout.children) b.classList.toggle('active', b.dataset.value === f.layout);
  [...els.presets.children].forEach((chip, i) => {
    const p = PRESETS[i];
    chip.classList.toggle('active', p.projection === f.projection && p.layout === f.layout);
  });
  els.swSwap.checked = f.swap;
  els.formatChip.textContent = formatLabel(f);
}

PRESETS.forEach((p) => {
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.textContent = p.label;
  chip.addEventListener('click', () => userSetFormat({ projection: p.projection, layout: p.layout }));
  els.presets.appendChild(chip);
});
els.segProjection.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) userSetFormat({ projection: b.dataset.value });
});
els.segLayout.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) userSetFormat({ layout: b.dataset.value });
});
els.swSwap.addEventListener('change', () => userSetFormat({ swap: els.swSwap.checked }));

// ---------------- Ajustes ----------------
function setRangeFill(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', p + '%');
}

function syncSliders() {
  for (const s of SLIDERS) {
    const input = $(s.id);
    input.value = state[s.group][s.key];
    $(s.id + '-val').textContent = s.fmt(Number(input.value));
    setRangeFill(input);
  }
}

for (const s of SLIDERS) {
  const input = $(s.id);
  Object.assign(input, { min: s.min, max: s.max, step: s.step });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    state[s.group][s.key] = v;
    $(s.id + '-val').textContent = s.fmt(v);
    setRangeFill(input);
    applySettings();
  });
  input.addEventListener('change', saveSettings);
}

function applySettings() {
  if (!vr) return;
  vr.setImage(state.image);
  vr.setHeadsetSettings(state.headsetSettings);
}

function saveSettings() {
  store.set('image', state.image);
  store.set('headset', state.headsetSettings);
}

$('btn-reset').addEventListener('click', () => {
  state.image = { ...DEFAULT_IMAGE };
  state.headsetSettings = { ...DEFAULT_HEADSET };
  syncSliders();
  applySettings();
  saveSettings();
  toast('Ajustes restaurados');
});

// ---------------- Sheets ----------------
function openSheet(sheet) {
  closeSheets();
  if (sheet === els.sheetSettings) syncSliders();
  sheet.classList.add('show');
  els.backdrop.classList.add('show');
  clearTimeout(hideTimer);
}

function closeSheets() {
  els.sheetFormat.classList.remove('show');
  els.sheetSettings.classList.remove('show');
  els.backdrop.classList.remove('show');
  scheduleHide();
}

const sheetOpen = () => els.backdrop.classList.contains('show');

els.backdrop.addEventListener('click', closeSheets);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));
$('btn-format').addEventListener('click', () => openSheet(els.sheetFormat));
els.formatChip.addEventListener('click', () => openSheet(els.sheetFormat));
$('btn-settings').addEventListener('click', () => openSheet(els.sheetSettings));

// ---------------- Reprodução ----------------
function requestGyroOnce() {
  if (state.gyroAsked || !look) return;
  state.gyroAsked = true;
  look.requestGyro().then((ok) => {
    if (!ok && typeof DeviceOrientationEvent?.requestPermission === 'function') {
      toast('Sem acesso ao movimento: arraste o dedo para olhar em volta.');
    }
  });
}

function playVideo() {
  requestGyroOnce();
  const p = video.play();
  if (p && p.catch) {
    p.catch((err) => {
      if (err && err.name !== 'AbortError') toast('Toque para reproduzir');
    });
  }
}

function togglePlay() {
  requestGyroOnce();
  if (video.paused || video.ended) playVideo();
  else video.pause();
}

function seekBy(seconds) {
  if (!isFinite(video.duration)) return;
  video.currentTime = clamp(video.currentTime + seconds, 0, video.duration - 0.1);
  hud(seconds > 0 ? '+10 s' : '−10 s');
  scheduleHide();
}

function handleTap() {
  if (state.headset) {
    togglePlay();
    hud(video.paused ? 'Pausado' : 'Reproduzindo');
    return;
  }
  setControlsVisible(!state.controlsVisible);
}

els.bigPlay.addEventListener('click', playVideo);
els.btnPlay.addEventListener('click', togglePlay);
$('btn-back10').addEventListener('click', () => seekBy(-10));
$('btn-fwd10').addEventListener('click', () => seekBy(10));
els.btnMute.addEventListener('click', () => {
  video.muted = !video.muted;
  els.btnMute.querySelector('use').setAttribute('href', video.muted ? '#i-muted' : '#i-speaker');
});
$('btn-recenter').addEventListener('click', () => {
  requestGyroOnce();
  look.recenter();
  hud('Visão centralizada');
});
els.btnHeadset.addEventListener('click', () => setHeadset(!state.headset));
$('btn-close').addEventListener('click', closePlayer);

video.addEventListener('play', () => {
  els.player.classList.remove('paused');
  setPlayIcon(true);
  scheduleHide();
  acquireWakeLock();
});
video.addEventListener('playing', () => {
  if (!state.unlocked) {
    state.unlocked = true;
    look.immediateTap = false;
  }
  if (state.autoAnalyzePending) {
    state.autoAnalyzePending = false;
    setTimeout(() => {
      const a = analyzeFrame(video);
      if (a && a.valid) refineFromAnalysis(a);
    }, 900);
  }
});
video.addEventListener('pause', () => {
  els.player.classList.add('paused');
  setPlayIcon(false);
  if (!state.headset) setControlsVisible(true);
  releaseWakeLock();
});
video.addEventListener('ended', () => {
  els.player.classList.add('paused');
  setPlayIcon(false);
});
video.addEventListener('loadedmetadata', () => vr && vr.updatePlane());
video.addEventListener('error', () => {
  if (state.objectUrl) toast('Erro ao reproduzir o vídeo.');
});

function setPlayIcon(playing) {
  els.btnPlay.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  els.btnPlay.setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir');
}

// Barra de progresso
const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

let lastShownSecond = -1;
function updateTimeUI() {
  if (state.scrubbing || !state.controlsVisible) return;
  const d = video.duration;
  const t = video.currentTime;
  if (isFinite(d) && d > 0) {
    els.scrubber.value = Math.round((t / d) * 1000);
    setRangeFill(els.scrubber);
  }
  const sec = Math.floor(t);
  if (sec !== lastShownSecond) {
    lastShownSecond = sec;
    els.tCur.textContent = fmtTime(t);
    els.tDur.textContent = fmtTime(d);
  }
}

els.scrubber.addEventListener('input', () => {
  state.scrubbing = true;
  clearTimeout(hideTimer);
  const d = video.duration;
  if (!isFinite(d)) return;
  const t = (els.scrubber.value / 1000) * d;
  if (typeof video.fastSeek === 'function') video.fastSeek(t);
  else video.currentTime = t;
  els.tCur.textContent = fmtTime(t);
  setRangeFill(els.scrubber);
});
els.scrubber.addEventListener('change', () => {
  state.scrubbing = false;
  scheduleHide();
});

// ---------------- Controles visíveis / ocultos ----------------
let hideTimer = null;
function setControlsVisible(visible) {
  state.controlsVisible = visible;
  els.controls.classList.toggle('hidden', !visible);
  if (visible) {
    lastShownSecond = -1;
    scheduleHide();
  } else {
    clearTimeout(hideTimer);
  }
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!video.paused && !sheetOpen() && !state.scrubbing) setControlsVisible(false);
  }, 3500);
}

els.controls.addEventListener('pointerdown', () => scheduleHide(), true);

// ---------------- Modo Óculos ----------------
function setHeadset(on) {
  state.headset = on;
  vr.setHeadset(on);
  look.headsetMode = on;
  look.immediateTap = on && !state.unlocked;
  els.player.classList.toggle('headset', on);
  els.btnHeadset.classList.toggle('active', on);
  requestGyroOnce();
  if (on) {
    closeSheets();
    setControlsVisible(false);
    look.recenter();
    hud('Toque: reproduzir/pausar\nToque duplo: menu · Segurar: centralizar', 4000);
    if (video.paused) playVideo();
  } else {
    setControlsVisible(true);
  }
}

// ---------------- HUD e Toast ----------------
let hudTimer = null;
function hud(text, ms = 1100) {
  els.hudL.textContent = text;
  els.hudR.textContent = text;
  els.hudL.style.whiteSpace = els.hudR.style.whiteSpace = 'pre-line';
  els.hud.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => els.hud.classList.remove('show'), ms);
}

let toastTimer = null;
function toast(text, ms = 3200) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
}

// ---------------- Wake Lock (tela não apaga) ----------------
async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && !state.wakeLock) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => (state.wakeLock = null));
    }
  } catch { /* não suportado */ }
}
function releaseWakeLock() {
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !video.paused) acquireWakeLock();
});

// ---------------- Telas ----------------
function showPlayer() {
  els.home.hidden = true;
  els.player.hidden = false;
  els.player.classList.add('paused');
  setPlayIcon(false);
  els.tCur.textContent = '0:00';
  els.tDur.textContent = '0:00';
  els.scrubber.value = 0;
  setRangeFill(els.scrubber);
  vr.resize();
  look.recenter();
  look.immediateTap = state.headset && !state.unlocked;
  startLoop();
}

function releaseVideo() {
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
}

function closePlayer() {
  if (state.headset) setHeadset(false);
  closeSheets();
  stopLoop();
  releaseVideo();
  releaseWakeLock();
  els.player.hidden = true;
  els.home.hidden = false;
}

// ---------------- Inicialização ----------------
(function init() {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone) $('install-tip').hidden = false;

  syncSliders();
  renderFormatUI();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ?src=URL abre um vídeo por endereço (testes / futuro servidor no PC).
  const src = new URLSearchParams(location.search).get('src');
  if (src) {
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
      .then((blob) => openFile(new File([blob], decodeURIComponent(src.split('/').pop().split('?')[0]), { type: blob.type })))
      .catch(() => toast('Não foi possível baixar o vídeo do endereço informado.'));
  }
})();
