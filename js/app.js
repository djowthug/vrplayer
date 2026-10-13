// VR Player — interface, carregamento de arquivos e estado.
import * as THREE from 'three';
import { VRRenderer } from './renderer.js';
import { LookControls } from './controls.js';
import { analyzeFrame, guessFormat, detectFromName } from './detect.js';
import { GamepadManager } from './gamepad.js';
import { VirtualCursor } from './cursor.js';
import {
  getTorboxApiKey,
  setTorboxApiKey,
  getGofileApiKey,
  setGofileApiKey,
  fetchTorboxTorrents,
  requestTorboxStreamUrl,
  addTorboxMagnet,
  addTorboxWebDownload,
  resolveGofileLink,
  preparePlayableUrl,
  sendDownloadToPc,
  getCloudHistory,
  addToCloudHistory,
  removeFromCloudHistory,
  clearCloudHistory,
} from './cloud.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isElectron = !!(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron);

const els = {
  home: $('home'),
  player: $('player'),
  fileInput: $('file-input'),
  openFileBtn: $('open-file-btn'),
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
  formatPaneLeft: $('format-pane-left'),
  formatPaneRight: $('format-pane-right'),
  sheetSettings: $('sheet-settings'),
  settingsPill: $('settings-pill'),
  btnHomeHeadset: $('btn-home-headset'),
  homePanePrimary: $('home-pane-primary'),
  homePaneMirror: $('home-pane-mirror'),
  sheetCodecs: $('sheet-codecs'),
  btnShowCodecs: $('btn-show-codecs'),
  codecDiagnosticsContent: $('codec-diagnostics-content'),
  sheetBatch: $('sheet-batch'),
  btnOpenBatchHome: $('btn-open-batch-home'),
  btnShowBatch: $('btn-show-batch'),
  batchFolderInput: $('batch-folder-input'),
  btnBatchBrowse: $('btn-batch-browse'),
  btnBatchScan: $('btn-batch-scan'),
  batchSummary: $('batch-summary'),
  batchToolbar: $('batch-selection-toolbar'),
  btnBatchSelectAll: $('btn-batch-select-all'),
  btnBatchSelectNeeded: $('btn-batch-select-needed'),
  btnBatchSelectNone: $('btn-batch-select-none'),
  batchList: $('batch-list'),
  batchProgressBox: $('batch-progress-box'),
  batchProgressTitle: $('batch-progress-title'),
  batchProgressPercent: $('batch-progress-percent'),
  batchProgressFill: $('batch-progress-fill'),
  batchProgressSub: $('batch-progress-sub'),
  btnBatchStart: $('btn-batch-start'),
  btnBatchCancel: $('btn-batch-cancel'),
  presets: $('presets'),
  segProjection: $('seg-projection'),
  segLayout: $('seg-layout'),
  swSwap: $('sw-swap'),
  detectCaption: $('detect-caption'),
  boxFisheyeFormat: $('box-fisheye-format'),
  fePresetsFormat: $('fe-presets-format'),
  slFeFovFmt: $('sl-fe-fov-fmt'),
  slFeFovFmtVal: $('sl-fe-fov-fmt-val'),
  slFeScaleFmt: $('sl-fe-scale-fmt'),
  slFeScaleFmtVal: $('sl-fe-scale-fmt-val'),
  fePresetsSettings: $('fe-presets-settings'),
  btnResetDesktopView: $('btn-reset-desktop-view'),
  btnResetFisheye: $('btn-reset-fisheye'),
  hud: $('hud'),
  hudL: $('hud-l'),
  hudR: $('hud-r'),
  toast: $('toast'),
  serverUrlInput: $('server-url-input'),
  btnConnectServer: $('btn-connect-server'),
  btnDiscoverServer: $('btn-discover-server'),
  btnTelemetry: $('btn-telemetry'),
  telemetryOverlay: $('telemetry-overlay'),
  telFps: $('tel-fps'),
  telRes: $('tel-res'),
  telBuffer: $('tel-buffer'),
  telDrops: $('tel-drops'),
  telGpu: $('tel-gpu'),
  hudTelL: $('hud-tel-l'),
  hudTelR: $('hud-tel-r'),
  btnResetImage: $('btn-reset-image'),
  segEnvironment: $('seg-environment'),
  segEnvFormat: $('seg-env-format'),
  pcServerSection: $('pc-server-section'),
  pcServerTitle: $('pc-server-title'),
  pcServerBadge: $('pc-server-badge'),
  monitoredFoldersBar: $('monitored-folders-bar'),
  monitoredFoldersList: $('monitored-folders-list'),
  btnAddFolder: $('btn-add-folder'),
  btnRescanFolders: $('btn-rescan-folders'),
  pcServerConnectWrap: $('pc-server-connect-wrap'),
  pcVideoList: $('pc-video-list'),
  pcServerMsg: $('pc-server-msg'),
  // Elementos da Nuvem (Torbox & Gofile)
  tabCloudLink: $('tab-cloud-link'),
  tabCloudTorbox: $('tab-cloud-torbox'),
  tabCloudHistory: $('tab-cloud-history'),
  cloudPanelLink: $('cloud-panel-link'),
  cloudPanelTorbox: $('cloud-panel-torbox'),
  cloudPanelHistory: $('cloud-panel-history'),
  cloudUrlInput: $('cloud-url-input'),
  btnCloudPlay: $('btn-cloud-play'),
  btnCloudPlay4k: $('btn-cloud-play-4k'),
  btnToggleSmoothStream: $('btn-toggle-smooth-stream'),
  torboxKeyInput: $('torbox-key-input'),
  btnTorboxSaveKey: $('btn-torbox-save-key'),
  btnTorboxRefresh: $('btn-torbox-refresh'),
  torboxTorrentList: $('torbox-torrent-list'),
  torboxEmptyMsg: $('torbox-empty-msg'),
  cloudHistoryList: $('cloud-history-list'),
  cloudHistoryEmpty: $('cloud-history-empty'),
  btnClearCloudHistory: $('btn-clear-cloud-history'),
  cloudStatusMsg: $('cloud-status-msg'),
  sheetCloudFiles: $('sheet-cloud-files'),
  sheetCloudFilesTitle: $('sheet-cloud-files-title'),
  sheetCloudFilesSub: $('sheet-cloud-files-sub'),
  cloudFilesListContainer: $('cloud-files-list-container'),
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

const DEFAULT_IMAGE = { exposure: 0, brightness: 0, contrast: 1, saturation: 1, gamma: 1 };

// ---------------- Presets de Headset (Calibração Óptica Avançada) ----------------
const VR_PRESETS = {
  cardboard: {
    name: 'Google Cardboard',
    fov: 80,
    k1_distortion: 0.35,
    k2_distortion: 0.10,
    chromatic_aberration: 0.02,
    ipd_offset: 0.0,
    sharpening: 20,
  },
  vrbox: {
    name: 'VR Box 2.0',
    fov: 82,
    k1_distortion: 0.22,
    k2_distortion: 0.04,
    chromatic_aberration: 0.05,
    ipd_offset: 0.0,
    sharpening: 35,
  },
  vrgpro: {
    name: 'VRG Pro (Full Screen)',
    fov: 115,
    k1_distortion: 0.18,
    k2_distortion: 0.08,
    chromatic_aberration: 0.01,
    ipd_offset: -0.02,
    sharpening: 10,
  },
  desktop: {
    name: 'Desktop / Flat Screen',
    fov: 75,
    k1_distortion: 0.0,
    k2_distortion: 0.0,
    chromatic_aberration: 0.0,
    ipd_offset: 0.0,
    sharpening: 0,
  },
};
const PRESET_ORDER = Object.keys(VR_PRESETS);

/** Converte os nomes de campo do preset para as chaves usadas no estado. */
const presetToOptics = (p) => ({
  fov: p.fov,
  k1: p.k1_distortion,
  k2: p.k2_distortion,
  ca: p.chromatic_aberration,
  sharpening: p.sharpening,
  ipd: p.ipd_offset,
});

/** Faixas dos parâmetros vinculados a preset, por modo (o modo Tela não tem IPD). */
const OPTICS_RANGES = {
  headsetSettings: { fov: [60, 120], k1: [0, 0.6], k2: [0, 0.3], ca: [0, 0.15], sharpening: [0, 100], ipd: [-0.15, 0.15] },
  desktopView: { fov: [30, 120], k1: [0, 0.6], k2: [0, 0.3], ca: [0, 0.15], sharpening: [0, 100] },
};

/** Valores de um preset já limitados às faixas do grupo (headsetSettings ou desktopView). */
function presetValuesFor(group, presetId) {
  const p = VR_PRESETS[presetId];
  if (!p) return null;
  const v = presetToOptics(p);
  const ranges = OPTICS_RANGES[group];
  const out = {};
  for (const k of Object.keys(ranges)) out[k] = clamp(v[k], ranges[k][0], ranges[k][1]);
  return out;
}

const DEFAULT_HEADSET = {
  basePreset: 'vrbox',
  ...presetValuesFor('headsetSettings', 'vrbox'),
  lensLX: 0, lensLY: 0, lensRX: 0, lensRY: 0,
  vShift: 0,
  roll: 0,
};
const DEFAULT_DESKTOP_VIEW = { basePreset: 'desktop', ...presetValuesFor('desktopView', 'desktop') };
const DEFAULT_FISHEYE = { fov: 180, scale: 1.0 };

/** Carrega um perfil óptico salvo, migrando o antigo campo `distortion` para K1/K2. */
function loadOptics(key, defaults) {
  const saved = { ...store.get(key, {}) };
  if (saved.k1 === undefined && typeof saved.distortion === 'number') {
    saved.k1 = saved.distortion;
    saved.k2 = Number((saved.distortion * 0.4).toFixed(3));
  }
  delete saved.distortion;
  if (!VR_PRESETS[saved.basePreset]) delete saved.basePreset;
  return { ...defaults, ...saved };
}

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
  { id: 'sl-exposure', group: 'image', key: 'exposure', min: -1.0, max: 1.0, step: 0.05, fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2) + ' EV' },
  { id: 'sl-brightness', group: 'image', key: 'brightness', min: -0.3, max: 0.3, step: 0.01, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) },
  { id: 'sl-contrast', group: 'image', key: 'contrast', min: 0.6, max: 1.6, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
  { id: 'sl-saturation', group: 'image', key: 'saturation', min: 0.0, max: 2.0, step: 0.02, fmt: (v) => Math.round(v * 100) + '%' },
  { id: 'sl-gamma', group: 'image', key: 'gamma', min: 0.6, max: 1.6, step: 0.02, fmt: (v) => v.toFixed(2) },
  { id: 'sl-view-fov', group: 'desktopView', key: 'fov', min: 30, max: 120, step: 1, fmt: (v) => Math.round(v) + '°' },
  { id: 'sl-desktop-dist', group: 'desktopView', key: 'k1', min: 0, max: 0.6, step: 0.01, fmt: (v) => v.toFixed(2) },
  { id: 'sl-fe-fov', group: 'fisheye', key: 'fov', min: 160, max: 230, step: 1, fmt: (v) => Math.round(v) + '°' },
  { id: 'sl-fe-scale', group: 'fisheye', key: 'scale', min: 0.85, max: 1.25, step: 0.005, fmt: (v) => Math.round(v * 100) + '%' },
  { id: 'sl-ipd', group: 'headsetSettings', key: 'ipd', min: -0.15, max: 0.15, step: 0.005, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) },
  { id: 'sl-fov', group: 'headsetSettings', key: 'fov', min: 60, max: 120, step: 1, fmt: (v) => Math.round(v) + '°' },
  { id: 'sl-distortion', group: 'headsetSettings', key: 'k1', min: 0, max: 0.6, step: 0.01, fmt: (v) => v.toFixed(2) },
  { id: 'sl-cursor-speed', group: 'cursor', key: 'speed', min: 30, max: 250, step: 5, fmt: (v) => Math.round(v) + '%' },
];

const state = {
  format: { projection: '360', layout: 'mono', swap: false },
  image: { ...DEFAULT_IMAGE, ...store.get('image', {}) },
  headsetSettings: loadOptics('headset', DEFAULT_HEADSET),
  desktopView: loadOptics('desktopView', DEFAULT_DESKTOP_VIEW),
  fisheye: { ...DEFAULT_FISHEYE, ...store.get('fisheye', {}) },
  cursor: { speed: store.get('cursorSpeed', 100) },
  headset: store.get('vr_mode', false),
  environment: store.get('environment', 'cinema'),
  telemetryVisible: store.get('telemetry', false),
  fileName: '',
  fileKey: null,
  objectUrl: null,
  originalPath: null,
  userChangedFormat: false,
  autoAnalyzePending: false,
  gyroAsked: false,
  unlocked: false,
  controlsVisible: true,
  scrubbing: false,
  wakeLock: null,
  // Estado para streaming HLS dinâmico com seek (-ss)
  isHls: false,
  hlsOffset: 0,
  totalDuration: 0,
  hlsRelPath: null,
  hlsBaseUrl: '',
  hlsBasePlaylistUrl: '',
  isSeekingHls: false,
  hlsSeekEpoch: 0,
};

let vr = null;
let look = null;
let gamepad = null;
let virtualCursor = null;
const viewQ = new THREE.Quaternion();

// ---------------- Motor 3D ----------------
function ensureEngine() {
  if (vr) return;
  vr = new VRRenderer($('stage'), video);
  look = new LookControls($('stage'), () => vr.currentFov());
  look.onTap = handleTap;
  look.onDoubleTap = () => {
    if (sheetOpen()) return;
    settingsPill.toggle();
  };
  look.onLongPress = () => {
    look.recenter();
    hud('Visão centralizada');
  };
  look.onPinch = (ratio) => {
    if (!state.headset) {
      vr.viewFov = clamp(vr.viewFov / ratio, 30, 120);
      state.desktopView.fov = vr.viewFov;
      syncSliders();
      saveSettings();
    }
  };
  vr.setImage(state.image);
  vr.setHeadsetSettings(state.headsetSettings);
  vr.setEnvironment(state.environment);
  vr.setFisheyeSettings(state.fisheye);
  vr.setDesktopOptics(state.desktopView);
  vr.viewFov = state.desktopView.fov;

  const onResize = () => vr && vr.resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 300));
}

function initGamepad() {
  if (!virtualCursor) {
    virtualCursor = new VirtualCursor({
      id: 'gamepad-cursor',
      deadzone: 0.15,
      baseSpeed: 550,
      sensitivity: state.cursor.speed,
      hideTimeout: 3000,
      isUiActive: () => els.player.hidden || state.controlsVisible || sheetOpen() || settingsPill?.isOpen(),
    });
  }

  if (gamepad) return;
  gamepad = new GamepadManager({
    isPillActive: () => settingsPill?.isOpen(),
    onPillClose: () => settingsPill?.close(),
    onPillReset: () => settingsPill?.resetCurrent(),
    onPillPrev: () => settingsPill?.prev(),
    onPillNext: () => settingsPill?.next(),
    onPillAdjust: (dir) => settingsPill?.adjust(dir),
    onPillPresetCycle: (dir) => settingsPill?.isOpen() && cyclePreset(dir),
    onPlayPause: () => {
      if (els.player.hidden) return;
      if (state.controlsVisible || sheetOpen() || settingsPill?.isOpen()) return;
      togglePlay();
      hud(video.paused ? 'Pausado' : 'Reproduzindo');
    },
    onRecenter: () => {
      if (virtualCursor?.hasActiveSlider()) {
        virtualCursor.deactivateActiveSlider();
        return;
      }
      if (els.player.hidden) return;
      requestGyroOnce();
      look?.recenter();
      hud('Visão centralizada');
    },
    onSeek: (seconds) => {
      if (els.player.hidden || settingsPill?.isOpen()) return;
      seekBy(seconds);
    },
    onToggleHeadset: () => {
      setHeadset(!state.headset);
      if (!els.player.hidden) {
        hud(state.headset ? 'Modo Óculos' : 'Modo Tela');
      } else {
        toast(state.headset ? '🥽 Modo Óculos Ativado' : 'Modo Tela Ativado');
      }
    },
    onToggleMenu: () => {
      if (els.player.hidden) return;
      if (settingsPill?.isOpen()) {
        settingsPill.close();
      } else {
        setControlsVisible(!state.controlsVisible);
      }
    },
    onRotateYaw: (delta) => {
      if (els.player.hidden || state.controlsVisible || sheetOpen() || settingsPill?.isOpen()) return;
      look?.rotateYaw(delta);
    },
    onRotatePitch: (delta) => {
      if (els.player.hidden || state.controlsVisible || sheetOpen() || settingsPill?.isOpen()) return;
      look?.rotatePitch(delta);
    },
    onVolumeChange: (delta) => {
      if (els.player.hidden || settingsPill?.isOpen()) return;
      video.volume = clamp(video.volume + delta, 0, 1);
      hud(`Volume ${Math.round(video.volume * 100)}%`);
    },
    onConnected: (name) => {
      hud(`🎮 ${name} conectado`, 3000);
      toast(`🎮 Controle conectado: ${name}`);
    },
    onDisconnected: () => {
      hud('🎮 Controle desconectado', 2500);
      toast('Controle desconectado');
    },
  });
}

// ---------------- Telemetria & Monitor de Performance ----------------
let lastLoopTime = 0;
let fpsFrames = 0;
let fpsLastTime = performance.now();
let currentFps = 60;
let serverTelemetryInfo = null;
let lastTelemetryFetch = 0;

async function pollServerTelemetry() {
  const serverUrl = store.get('server_url');
  if (!serverUrl || Date.now() - lastTelemetryFetch < 5000) return;
  lastTelemetryFetch = Date.now();
  try {
    const res = await fetch(`${serverUrl}/api/telemetry`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      serverTelemetryInfo = await res.json();
    }
  } catch {}
}

function updateTelemetryDisplay(fps) {
  if (!state.telemetryVisible) return;

  if (els.telFps) els.telFps.textContent = `${fps} FPS`;

  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  let resText = '--';
  if (vw > 0) {
    if (vw >= 7000 || vh >= 3500) resText = '8K';
    else if (vw >= 3500 || vh >= 1800) resText = '4K';
    else if (vw >= 1900) resText = '1080p';
    else resText = `${vw}p`;
  }
  if (els.telRes) els.telRes.textContent = resText;

  let bufSeconds = 0;
  try {
    const cur = video.currentTime || 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= cur + 0.1 && cur <= video.buffered.end(i)) {
        bufSeconds = Math.max(0, video.buffered.end(i) - cur);
        break;
      }
    }
  } catch {}

  if (els.telBuffer) {
    els.telBuffer.textContent = `${bufSeconds.toFixed(1)}s`;
    els.telBuffer.className = 'tel-v ' + (bufSeconds > 4 ? 'good' : bufSeconds > 1.5 ? 'warn' : 'bad');
  }

  let dropCount = 0;
  let dropPct = '0%';
  if (typeof video.getVideoPlaybackQuality === 'function') {
    const q = video.getVideoPlaybackQuality();
    dropCount = q.droppedVideoFrames || 0;
    const total = q.totalVideoFrames || 1;
    dropPct = ((dropCount / total) * 100).toFixed(1) + '%';
  } else if ('webkitDroppedFrameCount' in video) {
    dropCount = video.webkitDroppedFrameCount || 0;
  }

  if (els.telDrops) {
    els.telDrops.textContent = `${dropCount} (${dropPct})`;
    els.telDrops.className = 'tel-v ' + (dropCount === 0 ? 'good' : 'warn');
  }

  let gpuLabel = state.currentCloudOptions?.forceDownscale
    ? 'GPU NVENC (4K Suave)'
    : (state.isHls ? 'HLS GPU' : 'MP4 Nativo');
  if (!state.currentCloudOptions?.forceDownscale && serverTelemetryInfo && serverTelemetryInfo.gpuEncoder) {
    gpuLabel = serverTelemetryInfo.gpuEncoder.split(' ')[0] || 'GPU';
  }
  if (els.telGpu) els.telGpu.textContent = gpuLabel;

  if (state.headset) {
    const hudHtml = `⚡ <b>${fps} FPS</b> · Buf: <b>${bufSeconds.toFixed(1)}s</b> · Drops: <b>${dropCount}</b>`;
    if (els.hudTelL) { els.hudTelL.innerHTML = hudHtml; els.hudTelL.hidden = false; }
    if (els.hudTelR) { els.hudTelR.innerHTML = hudHtml; els.hudTelR.hidden = false; }
  } else {
    if (els.hudTelL) els.hudTelL.hidden = true;
    if (els.hudTelR) els.hudTelR.hidden = true;
  }
}

function toggleTelemetry() {
  state.telemetryVisible = !state.telemetryVisible;
  store.set('telemetry', state.telemetryVisible);
  if (els.telemetryOverlay) els.telemetryOverlay.hidden = !state.telemetryVisible;
  if (els.btnTelemetry) els.btnTelemetry.classList.toggle('active', state.telemetryVisible);
  if (state.telemetryVisible) {
    updateTelemetryDisplay(currentFps);
    pollServerTelemetry();
    hud('Telemetria ATIVA');
  } else {
    if (els.hudTelL) els.hudTelL.hidden = true;
    if (els.hudTelR) els.hudTelR.hidden = true;
    hud('Telemetria OCULTA');
  }
}

function startLoop() {
  lastLoopTime = performance.now();
  fpsLastTime = performance.now();
  fpsFrames = 0;

  if (els.telemetryOverlay) {
    els.telemetryOverlay.hidden = !state.telemetryVisible;
  }
  if (els.btnTelemetry) {
    els.btnTelemetry.classList.toggle('active', state.telemetryVisible);
  }

  vr.renderer.setAnimationLoop((time) => {
    const now = typeof time === 'number' ? time : performance.now();
    const dt = Math.min(Math.max((now - lastLoopTime) / 1000, 0.001), 0.1);
    lastLoopTime = now;

    fpsFrames++;
    if (now - fpsLastTime >= 500) {
      currentFps = Math.round((fpsFrames * 1000) / (now - fpsLastTime));
      fpsFrames = 0;
      fpsLastTime = now;
      if (state.telemetryVisible) {
        updateTelemetryDisplay(currentFps);
        pollServerTelemetry();
      }
    }

    gamepad?.update(dt);
    look.getQuaternion(viewQ);
    vr.render(viewQ, dt);
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

function openFile(file) {
  let originalPath = null;
  if (isElectron && window.electronAPI.getPathForFile) {
    originalPath = window.electronAPI.getPathForFile(file);
  }
  openVideoSource({
    url: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
    isBlob: true,
    originalPath,
  });
}

let hlsInstance = null;

async function attachHlsSource(videoEl, url) {
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch {}
    hlsInstance = null;
  }

  // 1. Safari / iOS nativo: suporta HLS direto pelo elemento <video>
  if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = url;
    videoEl.load();
    return;
  }

  // 2. Fallback com hls.js para navegadores baseados em Chromium/Firefox
  if (!window.Hls) {
    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1';
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  if (window.Hls && window.Hls.isSupported()) {
    hlsInstance = new window.Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(videoEl);
  } else {
    videoEl.src = url;
    videoEl.load();
  }
}

async function openVideoSource({
  url,
  name,
  size = 0,
  isBlob = false,
  originalPath = null,
  duration = 0,
  isHls = false,
  relPath = null,
  baseUrl = '',
}) {
  ensureEngine();
  releaseVideo();

  state.fileName = name;
  state.originalPath = originalPath;
  state.fileKey = `fmt:${name}:${size}`;
  state.userChangedFormat = false;
  state.autoAnalyzePending = false;
  els.title.textContent = name;

  // Configuração e detecção de streaming HLS
  const isHlsStream = isHls || url.includes('.m3u8') || url.includes('/hls/');
  state.isHls = isHlsStream;
  state.hlsOffset = 0;
  state.totalDuration = duration || 0;
  state.isSeekingHls = false;

  if (state.isHls) {
    let resolvedRel = relPath;
    if (!resolvedRel && url.includes('/hls/')) {
      try {
        const parts = url.split('/hls/')[1].split('/');
        resolvedRel = decodeURIComponent(parts[0]);
      } catch {}
    }
    state.hlsRelPath = resolvedRel;
    state.hlsBaseUrl = baseUrl || (url.startsWith('http') ? new URL(url).origin : location.origin);
    state.hlsBasePlaylistUrl = state.hlsRelPath
      ? `${state.hlsBaseUrl}/hls/${encodeURIComponent(state.hlsRelPath)}/master.m3u8`
      : url.split('?')[0];
  } else {
    state.hlsRelPath = null;
    state.hlsBaseUrl = '';
    state.hlsBasePlaylistUrl = '';
  }

  showPlayer();

  if (state.isHls && state.totalDuration > 0) {
    els.tDur.textContent = fmtTime(state.totalDuration);
  }

  if (isBlob) state.objectUrl = url;
  else state.objectUrl = null;

  video.crossOrigin = 'anonymous';

  if (state.isHls) {
    hud('Carregando streaming HLS...');
    await attachHlsSource(video, url);
  } else {
    video.src = url;
    video.load();
  }

  try {
    await waitFor(video, 'loadedmetadata');
  } catch (err) {
    if (isElectron && state.originalPath && window.electronAPI.optimizeMedia) {
      hud('Otimizando compatibilidade...');
      toast('Formato de vídeo/áudio requer otimização. Processando via FFmpeg...');
      try {
        const opt = await window.electronAPI.optimizeMedia(state.originalPath);
        if (opt && opt.success) {
          hud('Vídeo pronto!');
          toast('Vídeo otimizado com sucesso!');
          return openVideoSource({
            url: opt.url,
            name: opt.name,
            size: opt.size,
            isBlob: false,
            originalPath: opt.path,
          });
        }
      } catch (optErr) {
        console.error('Falha na otimização:', optErr);
      }
    }
    // Fallback inteligente para streaming via servidor do PC se for URL remota incompatível com Safari
    const isRemote = (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('/api/cloud/stream');
    const savedServer = getCurrentServerUrl();
    if (isRemote && savedServer && !state.cloudFallbackTried) {
      state.cloudFallbackTried = true;
      hud('Ativando streaming assistido pelo PC...');
      toast('Formato requer conversão. Transmitindo através do servidor do PC...');
      const proxyUrl = `${savedServer}/api/cloud/stream?url=${encodeURIComponent(url)}&transcode=1`;
      return openVideoSource({
        url: proxyUrl,
        name,
        size,
        isBlob: false,
      });
    }

    toast(isElectron
      ? 'Não foi possível reproduzir este vídeo. O formato ou codec não é compatível diretamente pelo navegador.'
      : 'Não foi possível abrir este vídeo. Verifique se o formato é compatível ou se o servidor do PC está acessível.');
    closePlayer();
    return;
  }

  if (isElectron && state.originalPath && window.electronAPI.probeMedia) {
    window.electronAPI.probeMedia(state.originalPath).then((probe) => {
      if (probe && probe.canProbe && probe.audioCodec) {
        const ac = probe.audioCodec.toLowerCase();
        if (['ac3', 'eac3', 'dts', 'truehd'].includes(ac)) {
          toast(`Trilha de áudio ${ac.toUpperCase()} detectada. Se estiver sem som, abra Ajustes para otimizar.`);
        }
      }
    }).catch(() => {});
  }

  const saved = store.get(state.fileKey);
  if (saved) {
    applyFormat(saved, 'Formato salvo para este vídeo');
  } else {
    const first = guessFormat(name, video.videoWidth, video.videoHeight, null);
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
  if (fmt.fisheye) {
    state.fisheye = { ...DEFAULT_FISHEYE, ...fmt.fisheye };
    if (vr) vr.setFisheyeSettings(state.fisheye);
    syncSliders();
  }
  vr.setFormat(state.format);
  if (caption !== undefined) els.detectCaption.textContent = caption;
  renderFormatUI();
}

function userSetFormat(partial) {
  state.userChangedFormat = true;
  state.autoAnalyzePending = false;
  applyFormat({ ...state.format, ...partial }, 'Escolhido manualmente');
  if (state.fileKey) {
    store.set(state.fileKey, { ...state.format, fisheye: state.fisheye });
  }
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

  if (els.boxFisheyeFormat) {
    els.boxFisheyeFormat.hidden = (f.projection !== 'fisheye');
  }
  updateFisheyeUI();
  if (state.headset && els.sheetFormat?.classList.contains('show')) {
    syncFormatStereo();
  }
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
  if (!input) return;
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', p + '%');
}

function updateFisheyeUI() {
  const currentFov = state.fisheye.fov;
  [els.fePresetsFormat, els.fePresetsSettings].forEach((container) => {
    if (!container) return;
    container.querySelectorAll('button[data-fov]').forEach((b) => {
      b.classList.toggle('active', Math.abs(Number(b.dataset.fov) - currentFov) < 1.5);
    });
  });
}

function syncSliders() {
  for (const s of SLIDERS) {
    const input = $(s.id);
    if (!input) continue;
    input.value = state[s.group][s.key];
    const valEl = $(s.id + '-val');
    if (valEl) valEl.textContent = s.fmt(Number(input.value));
    setRangeFill(input);
  }

  // Sincroniza controles rápidos no painel de Formato
  if (els.slFeFovFmt) {
    els.slFeFovFmt.value = state.fisheye.fov;
    if (els.slFeFovFmtVal) els.slFeFovFmtVal.textContent = Math.round(state.fisheye.fov) + '°';
    setRangeFill(els.slFeFovFmt);
  }
  if (els.slFeScaleFmt) {
    els.slFeScaleFmt.value = state.fisheye.scale;
    if (els.slFeScaleFmtVal) els.slFeScaleFmtVal.textContent = Math.round(state.fisheye.scale * 100) + '%';
    setRangeFill(els.slFeScaleFmt);
  }

  updateFisheyeUI();
  if (settingsPill?.isOpen()) {
    settingsPill.render(false);
  }
}

for (const s of SLIDERS) {
  const input = $(s.id);
  if (!input) continue;
  Object.assign(input, { min: s.min, max: s.max, step: s.step });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    state[s.group][s.key] = v;
    const valEl = $(s.id + '-val');
    if (valEl) valEl.textContent = s.fmt(v);
    setRangeFill(input);
    if (s.id === 'sl-cursor-speed') {
      virtualCursor?.setSensitivity(v);
    }
    applySettings();
    if (s.group === 'fisheye') {
      syncSliders();
    }
  });
  input.addEventListener('change', saveSettings);
}

// Controles rápidos de Fisheye no painel de Formato
els.slFeFovFmt?.addEventListener('input', () => {
  const v = Number(els.slFeFovFmt.value);
  state.fisheye.fov = v;
  applySettings();
  syncSliders();
});
els.slFeFovFmt?.addEventListener('change', saveSettings);

els.slFeScaleFmt?.addEventListener('input', () => {
  const v = Number(els.slFeScaleFmt.value);
  state.fisheye.scale = v;
  applySettings();
  syncSliders();
});
els.slFeScaleFmt?.addEventListener('change', saveSettings);

function setupFisheyePresetChips(container) {
  if (!container) return;
  container.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fov]');
    if (!b) return;
    const fov = Number(b.dataset.fov);
    const scale = Number(b.dataset.scale || 1.0);
    state.fisheye = { fov, scale };
    applySettings();
    syncSliders();
    saveSettings();
    toast(`Preset Fisheye: ${fov}°`);
  });
}
setupFisheyePresetChips(els.fePresetsFormat);
setupFisheyePresetChips(els.fePresetsSettings);

function applySettings() {
  if (!vr) return;
  vr.setImage(state.image);
  vr.setHeadsetSettings(state.headsetSettings);
  vr.setEnvironment(state.environment);
  vr.setFisheyeSettings(state.fisheye);
  vr.setDesktopOptics(state.desktopView);
  if (!state.headset) {
    vr.viewFov = state.desktopView.fov;
  }
}

function saveSettings() {
  store.set('image', state.image);
  store.set('headset', state.headsetSettings);
  store.set('environment', state.environment);
  store.set('desktopView', state.desktopView);
  store.set('fisheye', state.fisheye);
  store.set('cursorSpeed', state.cursor.speed);
  if (state.fileKey && state.format.projection === 'fisheye') {
    store.set(state.fileKey, { ...state.format, fisheye: state.fisheye });
  }
}

function setEnvironment(envId) {
  state.environment = envId;
  store.set('environment', envId);
  if (vr) vr.setEnvironment(envId);
  renderEnvironmentUI();
}

function renderEnvironmentUI() {
  [els.segEnvironment, els.segEnvFormat].forEach((seg) => {
    if (!seg) return;
    seg.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === state.environment);
    });
  });
}

[els.segEnvironment, els.segEnvFormat].forEach((seg) => {
  seg?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.value) setEnvironment(b.dataset.value);
  });
});

els.btnResetDesktopView?.addEventListener('click', () => {
  state.desktopView = { ...DEFAULT_DESKTOP_VIEW };
  if (vr && !state.headset) vr.viewFov = state.desktopView.fov;
  syncSliders();
  applySettings();
  saveSettings();
  toast('Câmera do PC restaurada');
});

els.btnResetFisheye?.addEventListener('click', () => {
  state.fisheye = { ...DEFAULT_FISHEYE };
  syncSliders();
  applySettings();
  saveSettings();
  toast('Calibração Fisheye restaurada');
});

els.btnResetImage?.addEventListener('click', () => {
  state.image = { ...DEFAULT_IMAGE };
  syncSliders();
  applySettings();
  saveSettings();
  toast('Cores da imagem restauradas');
});

$('btn-reset').addEventListener('click', () => {
  state.image = { ...DEFAULT_IMAGE };
  state.headsetSettings = { ...DEFAULT_HEADSET };
  state.desktopView = { ...DEFAULT_DESKTOP_VIEW };
  state.fisheye = { ...DEFAULT_FISHEYE };
  state.cursor = { speed: 100 };
  virtualCursor?.setSensitivity(100);
  state.environment = 'cinema';
  if (vr && !state.headset) vr.viewFov = state.desktopView.fov;
  syncSliders();
  applySettings();
  saveSettings();
  renderEnvironmentUI();
  toast('Ajustes restaurados');
});

// ---------------- Lógica Dinâmica de Presets de Headset ----------------
function activeOpticsGroup() {
  return state.headset ? 'headsetSettings' : 'desktopView';
}

function presetMatches(group) {
  const g = state[group];
  const baseId = g.basePreset;
  const p = VR_PRESETS[baseId];
  if (!p) return false;
  const target = presetValuesFor(group, baseId);
  if (!target) return false;
  for (const k of Object.keys(target)) {
    if (Math.abs((g[k] ?? 0) - target[k]) > 0.001) return false;
  }
  return true;
}

function currentPresetLabel(group = activeOpticsGroup()) {
  const g = state[group];
  if (presetMatches(group)) {
    return VR_PRESETS[g.basePreset]?.name || 'Personalizado';
  }
  return 'Personalizado';
}

function applyPreset(presetId) {
  const group = activeOpticsGroup();
  const vals = presetValuesFor(group, presetId);
  if (!vals) return;
  state[group].basePreset = presetId;
  Object.assign(state[group], vals);
  if (!state.headset) {
    vr.viewFov = state.desktopView.fov;
  }
  applySettings();
  saveSettings();
  syncSliders();
  settingsPill.render(true);
  settingsPill.flashPreset();
  toast(`Preset: ${VR_PRESETS[presetId].name}`);
}

function cyclePreset(dir = 1) {
  const group = activeOpticsGroup();
  const currentId = state[group].basePreset || (state.headset ? 'vrbox' : 'desktop');
  let idx = PRESET_ORDER.indexOf(currentId);
  if (idx < 0) idx = 0;
  const nextIdx = (idx + dir + PRESET_ORDER.length) % PRESET_ORDER.length;
  applyPreset(PRESET_ORDER[nextIdx]);
}

// ---------------- HUD Compacto Flutuante (Single-Slider Pill) ----------------
const settingsPill = {
  activeParamIndex: 0,
  inactivityTimer: null,
  isPresetMenuOpen: false,

  getParams() {
    const isHeadset = !!state.headset;
    const isFisheye = state.format?.projection === 'fisheye';
    const isStereo = isHeadset || (state.format?.layout && state.format.layout !== 'mono');

    const list = [];

    // --- Calibração Óptica e Lentes ---
    if (!isHeadset) {
      // Modo Desktop / Tela Cheia
      list.push({
        id: 'desktop-fov',
        label: 'Campo de Visão (FOV)',
        group: 'desktopView',
        key: 'fov',
        min: 30,
        max: 120,
        step: 1,
        defaultVal: () => presetValuesFor('desktopView', state.desktopView.basePreset)?.fov ?? 75,
        fmt: (v) => Math.round(v) + '°',
      });
      list.push({
        id: 'desktop-k1',
        label: 'Distorção K1 (2ª ordem)',
        group: 'desktopView',
        key: 'k1',
        min: 0,
        max: 0.60,
        step: 0.01,
        defaultVal: () => presetValuesFor('desktopView', state.desktopView.basePreset)?.k1 ?? 0,
        fmt: (v) => v.toFixed(2),
      });
      list.push({
        id: 'desktop-k2',
        label: 'Distorção K2 (4ª ordem)',
        group: 'desktopView',
        key: 'k2',
        min: 0,
        max: 0.30,
        step: 0.005,
        defaultVal: () => presetValuesFor('desktopView', state.desktopView.basePreset)?.k2 ?? 0,
        fmt: (v) => v.toFixed(3),
      });
      list.push({
        id: 'desktop-ca',
        label: 'Aberração Cromática (R/B)',
        group: 'desktopView',
        key: 'ca',
        min: 0,
        max: 0.15,
        step: 0.002,
        defaultVal: () => presetValuesFor('desktopView', state.desktopView.basePreset)?.ca ?? 0,
        fmt: (v) => (v * 100).toFixed(1) + '%',
      });
      list.push({
        id: 'desktop-sharp',
        label: 'Nitidez (Filtro CAS)',
        group: 'desktopView',
        key: 'sharpening',
        min: 0,
        max: 100,
        step: 1,
        defaultVal: () => presetValuesFor('desktopView', state.desktopView.basePreset)?.sharpening ?? 0,
        fmt: (v) => Math.round(v) + '%',
      });
    } else {
      // Modo Óculos VR (Headset)
      list.push({
        id: 'headset-fov',
        label: 'Campo de Visão (FOV)',
        group: 'headsetSettings',
        key: 'fov',
        min: 60,
        max: 120,
        step: 1,
        defaultVal: () => presetValuesFor('headsetSettings', state.headsetSettings.basePreset)?.fov ?? 82,
        fmt: (v) => Math.round(v) + '°',
      });
      list.push({
        id: 'headset-k1',
        label: 'Distorção K1 (2ª ordem)',
        group: 'headsetSettings',
        key: 'k1',
        min: 0,
        max: 0.60,
        step: 0.01,
        defaultVal: () => presetValuesFor('headsetSettings', state.headsetSettings.basePreset)?.k1 ?? 0.22,
        fmt: (v) => v.toFixed(2),
      });
      list.push({
        id: 'headset-k2',
        label: 'Distorção K2 (4ª ordem)',
        group: 'headsetSettings',
        key: 'k2',
        min: 0,
        max: 0.30,
        step: 0.005,
        defaultVal: () => presetValuesFor('headsetSettings', state.headsetSettings.basePreset)?.k2 ?? 0.04,
        fmt: (v) => v.toFixed(3),
      });
      list.push({
        id: 'headset-ca',
        label: 'Aberração Cromática (R/B)',
        group: 'headsetSettings',
        key: 'ca',
        min: 0,
        max: 0.15,
        step: 0.002,
        defaultVal: () => presetValuesFor('headsetSettings', state.headsetSettings.basePreset)?.ca ?? 0.05,
        fmt: (v) => (v * 100).toFixed(1) + '%',
      });
      list.push({
        id: 'headset-sharp',
        label: 'Nitidez (Filtro CAS)',
        group: 'headsetSettings',
        key: 'sharpening',
        min: 0,
        max: 100,
        step: 1,
        defaultVal: () => presetValuesFor('headsetSettings', state.headsetSettings.basePreset)?.sharpening ?? 35,
        fmt: (v) => Math.round(v) + '%',
      });

      // IPD Estéreo
      list.push({
        id: 'ipd',
        label: 'Distância dos Olhos (IPD)',
        group: 'headsetSettings',
        key: 'ipd',
        min: -0.15,
        max: 0.15,
        step: 0.005,
        defaultVal: () => presetValuesFor('headsetSettings', state.headsetSettings.basePreset)?.ipd ?? 0,
        fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100),
      });

      // Deslocamento Independente do Centro Óptico
      list.push({
        id: 'lens-lx',
        label: 'Centro Óptico Esq. X',
        group: 'headsetSettings',
        key: 'lensLX',
        min: -0.10,
        max: 0.10,
        step: 0.002,
        defaultVal: 0,
        fmt: (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%',
      });
      list.push({
        id: 'lens-ly',
        label: 'Centro Óptico Esq. Y',
        group: 'headsetSettings',
        key: 'lensLY',
        min: -0.10,
        max: 0.10,
        step: 0.002,
        defaultVal: 0,
        fmt: (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%',
      });
      list.push({
        id: 'lens-rx',
        label: 'Centro Óptico Dir. X',
        group: 'headsetSettings',
        key: 'lensRX',
        min: -0.10,
        max: 0.10,
        step: 0.002,
        defaultVal: 0,
        fmt: (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%',
      });
      list.push({
        id: 'lens-ry',
        label: 'Centro Óptico Dir. Y',
        group: 'headsetSettings',
        key: 'lensRY',
        min: -0.10,
        max: 0.10,
        step: 0.002,
        defaultVal: 0,
        fmt: (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%',
      });

      // Deslocamento Vertical Estéreo & Roll/Tilt
      list.push({
        id: 'v-shift',
        label: 'Alinhamento Vertical 3D',
        group: 'headsetSettings',
        key: 'vShift',
        min: -0.05,
        max: 0.05,
        step: 0.001,
        defaultVal: 0,
        fmt: (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%',
      });
      list.push({
        id: 'roll',
        label: 'Rotação do Horizonte (Roll)',
        group: 'headsetSettings',
        key: 'roll',
        min: -5.0,
        max: 5.0,
        step: 0.1,
        defaultVal: 0,
        fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(1) + '°',
      });
    }

    // --- Calibração Fisheye (apenas se projeção fisheye) ---
    if (isFisheye) {
      list.push({
        id: 'fe-fov',
        label: 'Abertura Fisheye (FOV)',
        group: 'fisheye',
        key: 'fov',
        min: 160,
        max: 230,
        step: 1,
        defaultVal: DEFAULT_FISHEYE.fov,
        fmt: (v) => Math.round(v) + '°',
      });
      list.push({
        id: 'fe-scale',
        label: 'Enquadramento Fisheye',
        group: 'fisheye',
        key: 'scale',
        min: 0.85,
        max: 1.25,
        step: 0.005,
        defaultVal: DEFAULT_FISHEYE.scale,
        fmt: (v) => Math.round(v * 100) + '%',
      });
    }

    // --- Imagem Shader WebGL ---
    list.push({
      id: 'brightness',
      label: 'Brilho',
      group: 'image',
      key: 'brightness',
      min: -0.3,
      max: 0.3,
      step: 0.01,
      defaultVal: DEFAULT_IMAGE.brightness,
      fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100),
    });
    list.push({
      id: 'contrast',
      label: 'Contraste',
      group: 'image',
      key: 'contrast',
      min: 0.6,
      max: 1.6,
      step: 0.01,
      defaultVal: DEFAULT_IMAGE.contrast,
      fmt: (v) => Math.round(v * 100) + '%',
    });
    list.push({
      id: 'saturation',
      label: 'Saturação',
      group: 'image',
      key: 'saturation',
      min: 0.0,
      max: 2.0,
      step: 0.02,
      defaultVal: DEFAULT_IMAGE.saturation,
      fmt: (v) => Math.round(v * 100) + '%',
    });
    list.push({
      id: 'exposure',
      label: 'Exposição',
      group: 'image',
      key: 'exposure',
      min: -1.0,
      max: 1.0,
      step: 0.05,
      defaultVal: DEFAULT_IMAGE.exposure,
      fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2) + ' EV',
    });
    list.push({
      id: 'gamma',
      label: 'Gamma',
      group: 'image',
      key: 'gamma',
      min: 0.6,
      max: 1.6,
      step: 0.02,
      defaultVal: DEFAULT_IMAGE.gamma,
      fmt: (v) => v.toFixed(2),
    });

    return list;
  },

  getCurrentParam() {
    const params = this.getParams();
    if (this.activeParamIndex < 0 || this.activeParamIndex >= params.length) {
      this.activeParamIndex = 0;
    }
    return params[this.activeParamIndex] || params[0];
  },

  isOpen() {
    return !!els.settingsPill && !els.settingsPill.hidden && els.settingsPill.classList.contains('show');
  },

  open() {
    if (!els.settingsPill) return;
    closeSheets();
    els.controls.classList.add('hidden');
    state.controlsVisible = false;
    clearTimeout(hideTimer);

    els.settingsPill.hidden = false;
    void els.settingsPill.offsetHeight;
    els.settingsPill.classList.add('show');

    this.render(true);
    this.resetTimer();

    const primaryInput = els.settingsPill.querySelector('.pill-pane.left .pill-range');
    if (primaryInput && virtualCursor) {
      virtualCursor.setActiveSlider?.(primaryInput);
    }
  },

  close() {
    if (!els.settingsPill || els.settingsPill.hidden) return;
    clearTimeout(this.inactivityTimer);
    this.closePresetMenu();
    els.settingsPill.classList.remove('show');
    setTimeout(() => {
      if (!this.isOpen()) {
        els.settingsPill.hidden = true;
      }
    }, 250);

    if (virtualCursor?.activeSlider?.classList?.contains('pill-range')) {
      virtualCursor.deactivateActiveSlider?.();
    }

    setControlsVisible(true);
  },

  toggle() {
    const now = performance.now();
    if (this._lastToggleTime && (now - this._lastToggleTime) < 300) return;
    this._lastToggleTime = now;
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  },

  resetTimer() {
    clearTimeout(this.inactivityTimer);
    if (this.isPresetMenuOpen) return;
    this.inactivityTimer = setTimeout(() => {
      if (this.isOpen()) {
        this.close();
      }
    }, 5000);
  },

  togglePresetMenu(force) {
    this.isPresetMenuOpen = force !== undefined ? !!force : !this.isPresetMenuOpen;
    els.settingsPill.querySelectorAll('.pill-preset-btn').forEach((btn) => {
      btn.setAttribute('aria-expanded', String(this.isPresetMenuOpen));
    });
    els.settingsPill.querySelectorAll('.pill-preset-menu').forEach((menu) => {
      menu.hidden = !this.isPresetMenuOpen;
      menu.classList.toggle('show', this.isPresetMenuOpen);
    });
    if (this.isPresetMenuOpen) {
      clearTimeout(this.inactivityTimer);
    } else {
      this.resetTimer();
    }
  },

  closePresetMenu() {
    if (this.isPresetMenuOpen) {
      this.togglePresetMenu(false);
    }
  },

  flashPreset() {
    els.settingsPill?.classList.remove('pill-flash');
    void els.settingsPill?.offsetWidth;
    els.settingsPill?.classList.add('pill-flash');
    setTimeout(() => els.settingsPill?.classList.remove('pill-flash'), 450);
  },

  renderPresetUI() {
    if (!els.settingsPill) return;
    const group = activeOpticsGroup();
    const label = currentPresetLabel(group);
    const isCustom = label === 'Personalizado';
    const activePresetId = state[group].basePreset;

    els.settingsPill.querySelectorAll('.pill-pane').forEach((pane) => {
      const nameEl = pane.querySelector('.pill-preset-name');
      if (nameEl) nameEl.textContent = label;

      const btn = pane.querySelector('.pill-preset-btn');
      if (btn) btn.classList.toggle('is-custom', isCustom);

      const menu = pane.querySelector('.pill-preset-menu');
      if (menu) {
        let html = '';
        PRESET_ORDER.forEach((id) => {
          const p = VR_PRESETS[id];
          const isActive = !isCustom && activePresetId === id;
          html += `<li class="pill-preset-item ${isActive ? 'active' : ''}" data-preset="${id}" role="option" aria-selected="${isActive}">${p.name}</li>`;
        });
        menu.innerHTML = html;
      }
    });
  },

  next() {
    const params = this.getParams();
    this.activeParamIndex = (this.activeParamIndex + 1) % params.length;
    this.render(true);
    this.resetTimer();
  },

  prev() {
    const params = this.getParams();
    this.activeParamIndex = (this.activeParamIndex - 1 + params.length) % params.length;
    this.render(true);
    this.resetTimer();
  },

  adjust(dir) {
    const param = this.getCurrentParam();
    if (!param) return;
    const curVal = Number(state[param.group][param.key]);
    const step = param.step * (dir > 0 ? 1 : -1);
    const newVal = clamp(Number((curVal + step).toFixed(4)), param.min, param.max);
    this.setValue(newVal);
    this.resetTimer();
  },

  setValue(val) {
    const param = this.getCurrentParam();
    if (!param) return;
    state[param.group][param.key] = val;
    if (param.id === 'desktop-fov' && vr && !state.headset) {
      vr.viewFov = val;
    }
    applySettings();
    saveSettings();
    syncSliders();
    this.render(false);
    this.resetTimer();
  },

  resetCurrent() {
    const param = this.getCurrentParam();
    if (!param) return;
    const def = typeof param.defaultVal === 'function' ? param.defaultVal() : param.defaultVal;
    this.setValue(def);
    toast(`${param.label} restaurado`);
    this.resetTimer();
  },

  render(updateInput = true) {
    if (!els.settingsPill) return;
    this.renderPresetUI();
    const params = this.getParams();
    const param = this.getCurrentParam();
    if (!param) return;

    const val = Number(state[param.group][param.key]);
    const formattedVal = param.fmt(val);
    const stepText = `${this.activeParamIndex + 1} / ${params.length}`;
    const percent = Math.max(0, Math.min(100, ((val - param.min) / (param.max - param.min)) * 100));

    // Atualiza ambos os painéis (esquerdo e direito para visão estéreo)
    els.settingsPill.querySelectorAll('.pill-pane').forEach((pane) => {
      const lbl = pane.querySelector('.pill-label');
      if (lbl) lbl.textContent = param.label;

      const valEl = pane.querySelector('.pill-val');
      if (valEl) valEl.textContent = formattedVal;

      const stepEl = pane.querySelector('.pill-step-info');
      if (stepEl) stepEl.textContent = stepText;

      const rangeInput = pane.querySelector('.pill-range');
      if (rangeInput) {
        rangeInput.min = param.min;
        rangeInput.max = param.max;
        rangeInput.step = param.step;
        if (updateInput) {
          rangeInput.value = val;
        }
        rangeInput.style.setProperty('--p', percent + '%');
      }
    });
  },

  init() {
    if (!els.settingsPill) return;

    // Presets dropdown: abrir / fechar ao clicar no botão
    els.settingsPill.querySelectorAll('.pill-preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePresetMenu();
      });
    });

    // Presets dropdown: seleção de item via delegação
    els.settingsPill.querySelectorAll('.pill-preset-menu').forEach((menu) => {
      menu.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.pill-preset-item');
        if (item && item.dataset.preset) {
          applyPreset(item.dataset.preset);
          this.closePresetMenu();
        }
      });
    });

    // Escuta cliques em todos os botões de ambos os painéis
    els.settingsPill.querySelectorAll('.pill-prev').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.prev();
      });
    });

    els.settingsPill.querySelectorAll('.pill-next').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.next();
      });
    });

    els.settingsPill.querySelectorAll('.pill-reset').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.resetCurrent();
      });
    });

    els.settingsPill.querySelectorAll('.pill-close').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    });

    els.settingsPill.querySelectorAll('.pill-val').forEach((badge) => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.resetCurrent();
      });
    });

    els.settingsPill.querySelectorAll('.pill-range').forEach((input) => {
      input.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        this.setValue(v);
      });
      input.addEventListener('change', () => {
        saveSettings();
      });
      input.addEventListener('pointerdown', () => {
        this.resetTimer();
      });
    });

    // Teclado para navegação do HUD flutuante
    window.addEventListener('keydown', (e) => {
      if (this.isOpen()) {
        if (e.key === 'Escape') {
          if (this.isPresetMenuOpen) {
            this.closePresetMenu();
          } else {
            this.close();
          }
          e.preventDefault();
          return;
        }
        if (e.key === 'p' || e.key === 'P') {
          cyclePreset(1);
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowUp' || e.key === '[' || e.key === 'PageUp') {
          this.prev();
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowDown' || e.key === ']' || e.key === 'PageDown') {
          this.next();
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowLeft') {
          this.adjust(-1);
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowRight') {
          this.adjust(1);
          e.preventDefault();
          return;
        }
        if (e.key === 'r' || e.key === 'R' || e.key === 'Backspace') {
          this.resetCurrent();
          e.preventDefault();
          return;
        }
      }
    });

    // Clique fora fecha o menu de preset ou a pílula
    document.addEventListener('pointerdown', (e) => {
      if (this.isPresetMenuOpen && !e.target.closest('.pill-preset-row')) {
        this.closePresetMenu();
      }
    });

    // Clique no palco do player fecha o pill
    $('stage')?.addEventListener('pointerdown', () => {
      if (this.isOpen()) {
        this.close();
      }
    });
  },
};

settingsPill.init();
window.settingsPill = settingsPill;

// ---------------- Sheets ----------------
function openSheet(sheet) {
  closeSheets();
  if (settingsPill?.isOpen()) {
    settingsPill.close();
  }
  if (els.btnToggleSmoothStream && (sheet === els.sheetFormat || sheet === els.sheetSettings)) {
    const isDownscaled = !!state.currentCloudOptions?.forceDownscale;
    els.btnToggleSmoothStream.textContent = isDownscaled
      ? '⚡ Modo 4K Suave Ativo (GPU) - Toque para desligar'
      : '⚡ Ativar Modo 4K Suave (GPU do PC em tempo real)';
    els.btnToggleSmoothStream.style.color = isDownscaled ? '#30d158' : '#bf5af2';
  }
  if (sheet === els.sheetFormat && state.headset) {
    syncFormatStereo();
  }
  sheet.classList.add('show');
  els.backdrop.classList.add('show');
  clearTimeout(hideTimer);
}

function toggleSmoothStream() {
  if (!state.currentCloudUrl) {
    toast('O Modo 4K Suave é para vídeos reproduzidos via Nuvem (Torbox / Gofile / Link).');
    return;
  }
  const isDownscaled = !!state.currentCloudOptions?.forceDownscale;
  const newDownscale = !isDownscaled;
  const currentTime = els.video.currentTime || 0;
  closeSheets();
  toast(newDownscale ? '⚡ Ativando 4K Suave com GPU do PC...' : 'Desativando 4K Suave...');
  const newOpts = { ...(state.currentCloudOptions || {}), forceDownscale: newDownscale };
  playCloudVideo(state.currentCloudUrl, state.currentCloudTitle, newOpts);
  els.video.addEventListener('loadedmetadata', () => {
    try { els.video.currentTime = currentTime; } catch {}
  }, { once: true });
}

function closeSheets() {
  els.sheetFormat?.classList.remove('show');
  if (els.formatPaneRight) els.formatPaneRight.hidden = true;
  if (els.sheetSettings) els.sheetSettings.classList.remove('show');
  if (els.sheetCodecs) els.sheetCodecs.classList.remove('show');
  if (els.sheetBatch) els.sheetBatch.classList.remove('show');
  if (els.sheetCloudFiles) els.sheetCloudFiles.classList.remove('show');
  if (settingsPill?.isOpen()) settingsPill.close();
  els.backdrop.classList.remove('show');
  scheduleHide();
}

const sheetOpen = () => els.backdrop.classList.contains('show');

els.backdrop.addEventListener('click', closeSheets);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));
$('btn-format').addEventListener('click', () => openSheet(els.sheetFormat));
els.formatChip.addEventListener('click', () => openSheet(els.sheetFormat));
$('btn-settings').addEventListener('click', () => settingsPill.open());
els.btnHomeHeadset?.addEventListener('click', () => {
  setHeadset(!state.headset);
  toast(state.headset ? '🥽 Modo Óculos: ATIVADO' : 'Modo Tela: ATIVADO');
});
els.btnToggleSmoothStream?.addEventListener('click', toggleSmoothStream);
els.btnShowCodecs?.addEventListener('click', async () => {
  await renderCodecsUI();
  openSheet(els.sheetCodecs);
});
els.btnShowBatch?.addEventListener('click', openBatchOptimizer);
els.btnOpenBatchHome?.addEventListener('click', openBatchOptimizer);

// ---------------- Otimização em Lote (Batch) ----------------
let batchScannedFiles = [];
let isBatchRunning = false;

async function openBatchOptimizer() {
  openSheet(els.sheetBatch);
  if (!els.batchFolderInput.value) {
    if (isElectron && window.electronAPI.batchGetDefaultFolder) {
      const def = await window.electronAPI.batchGetDefaultFolder();
      if (def) els.batchFolderInput.value = def;
    } else {
      const saved = store.get('batch_folder', '');
      if (saved) els.batchFolderInput.value = saved;
    }
  }
  if (els.batchFolderInput.value) {
    if (!batchScannedFiles.length) {
      scanBatchFolder(els.batchFolderInput.value);
    }
  } else {
    if (!isElectron) {
      // No modo web/servidor, busca pasta padrão configurada no servidor PC
      scanBatchFolder('');
    } else {
      els.batchSummary.hidden = false;
      els.batchSummary.textContent = 'Clique em "Escolher" para selecionar a pasta contendo seus vídeos.';
    }
  }
}

async function scanBatchFolder(folderPath) {
  if (isElectron && !folderPath) {
    if (window.electronAPI.batchSelectFolder) {
      const folder = await window.electronAPI.batchSelectFolder();
      if (folder) {
        folderPath = folder;
        els.batchFolderInput.value = folder;
        store.set('batch_folder', folder);
      } else {
        return;
      }
    } else {
      toast('Selecione uma pasta de vídeos');
      return;
    }
  }

  els.batchSummary.hidden = false;
  els.batchSummary.textContent = 'Escaneando pasta e analisando codecs com FFmpeg/ffprobe...';
  if (els.batchToolbar) els.batchToolbar.hidden = true;
  els.batchList.hidden = true;
  els.btnBatchStart.disabled = true;

  try {
    let videos = [];
    if (isElectron && window.electronAPI.batchScan) {
      videos = await window.electronAPI.batchScan(folderPath);
    } else {
      const base = els.serverUrlInput.value || location.origin;
      const url = folderPath ? `${base}/api/optimize/scan?folder=${encodeURIComponent(folderPath)}` : `${base}/api/optimize/scan`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Servidor retornou erro ' + res.status);
      const data = await res.json();
      videos = data.videos || [];
      if (data.folder && !els.batchFolderInput.value) {
        els.batchFolderInput.value = data.folder;
        folderPath = data.folder;
      }
    }

    batchScannedFiles = videos;
    renderBatchList(videos, folderPath || els.batchFolderInput.value);
  } catch (err) {
    els.batchSummary.textContent = 'Erro ao escanear pasta: ' + err.message;
    if (els.batchToolbar) els.batchToolbar.hidden = true;
  }
}

function renderBatchList(videos, folderPath) {
  els.batchList.innerHTML = '';
  if (!videos.length) {
    els.batchSummary.textContent = `Nenhum arquivo de vídeo encontrado em ${folderPath || 'esta pasta'}.`;
    if (els.batchToolbar) els.batchToolbar.hidden = true;
    els.batchList.hidden = true;
    els.btnBatchStart.disabled = true;
    return;
  }

  const needsOpt = videos.filter((v) => {
    const isReady = v.probe?.isIosCompatible ?? v.isIosCompatible;
    return !isReady;
  });
  els.batchSummary.textContent = `${videos.length} vídeo(s) encontrado(s): ${needsOpt.length} precisam de otimização para iPhone/PC.`;
  if (els.batchToolbar) els.batchToolbar.hidden = false;
  els.batchList.hidden = false;

  videos.forEach((v, index) => {
    const item = document.createElement('div');
    item.className = 'batch-item clickable';

    const p = v.probe || {};
    const isReady = p.isIosCompatible ?? v.isIosCompatible;
    const action = p.action ?? v.action ?? (isReady ? 'ready' : 'transcode');
    const badgeClass = isReady ? 'badge-ready' : (action === 'remux' ? 'badge-remux' : 'badge-transcode');
    const badgeText = isReady ? '✅ Compatível' : (action === 'remux' ? '⚡ Remux Rápido' : '🔄 Transcode');

    item.innerHTML = `
      <input type="checkbox" class="batch-checkbox" data-index="${index}" ${!isReady ? 'checked' : ''}>
      <div class="batch-item-info">
        <span class="batch-item-name">${v.name}</span>
        <span class="batch-item-meta">${v.size || ''} • Vídeo: ${p.videoCodec || '?'} | Áudio: ${p.audioCodec || '?'}</span>
      </div>
      <span class="badge-action ${badgeClass}">${badgeText}</span>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('batch-checkbox')) return;
      const cb = item.querySelector('.batch-checkbox');
      if (cb) {
        cb.checked = !cb.checked;
        updateBatchStartButton();
      }
    });

    els.batchList.appendChild(item);
  });

  updateBatchStartButton();

  els.batchList.querySelectorAll('.batch-checkbox').forEach((cb) => {
    cb.addEventListener('change', updateBatchStartButton);
  });
}

function updateBatchStartButton() {
  const checked = els.batchList.querySelectorAll('.batch-checkbox:checked');
  els.btnBatchStart.disabled = checked.length === 0 || isBatchRunning;
  els.btnBatchStart.textContent = `Iniciar Otimização (${checked.length} vídeo${checked.length === 1 ? '' : 's'})`;
}

async function startBatchOptimization() {
  const checkedCheckboxes = [...els.batchList.querySelectorAll('.batch-checkbox:checked')];
  const selectedFiles = checkedCheckboxes.map((cb) => batchScannedFiles[Number(cb.dataset.index)]).filter(Boolean);

  if (!selectedFiles.length) {
    toast('Selecione pelo menos um vídeo para otimizar.');
    return;
  }

  isBatchRunning = true;
  els.btnBatchStart.disabled = true;
  els.btnBatchStart.style.display = 'none';
  els.btnBatchCancel.style.display = 'block';
  els.batchProgressBox.hidden = false;
  els.batchProgressPercent.textContent = '0%';
  els.batchProgressFill.style.width = '0%';
  els.batchProgressSub.textContent = `Preparando fila de ${selectedFiles.length} vídeo(s)...`;

  const folderPath = els.batchFolderInput.value;

  if (isElectron && window.electronAPI.batchStart) {
    try {
      const res = await window.electronAPI.batchStart({
        folderPath,
        files: selectedFiles,
      });

      isBatchRunning = false;
      els.btnBatchCancel.style.display = 'none';
      els.btnBatchStart.style.display = 'block';
      els.btnBatchStart.disabled = false;
      els.btnBatchStart.textContent = 'Otimização Concluída!';
      els.batchProgressTitle.textContent = '🎉 Todos os vídeos foram otimizados!';
      els.batchProgressSub.textContent = 'Salvos na mesma pasta de origem com a tag "_otimizado.mp4"';
      toast('🎉 Vídeos otimizados salvos na mesma pasta com a tag "_otimizado.mp4"');
      scanBatchFolder(folderPath);
    } catch (err) {
      isBatchRunning = false;
      els.btnBatchCancel.style.display = 'none';
      els.btnBatchStart.style.display = 'block';
      els.btnBatchStart.disabled = false;
      toast('Erro na otimização: ' + err.message);
    }
  } else {
    try {
      const base = els.serverUrlInput.value || location.origin;
      await fetch(`${base}/api/optimize/start`, { method: 'POST' });
      toast('Otimização iniciada no computador!');
      pollServerBatchStatus();
    } catch (err) {
      isBatchRunning = false;
      els.btnBatchCancel.style.display = 'none';
      els.btnBatchStart.style.display = 'block';
      toast('Erro ao iniciar no servidor: ' + err.message);
    }
  }
}

let serverBatchPollInterval = null;

async function pollServerBatchStatus() {
  if (serverBatchPollInterval) clearInterval(serverBatchPollInterval);
  const base = els.serverUrlInput.value || location.origin;
  serverBatchPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${base}/api/optimize/status`);
      const st = await res.json();
      if (st.running) {
        els.batchProgressTitle.textContent = `Otimizando [${st.current}/${st.total}]: ${st.currentFile}`;
        els.batchProgressPercent.textContent = `${st.percent}%`;
        els.batchProgressFill.style.width = `${st.percent}%`;
        els.batchProgressSub.textContent = st.speed ? `Velocidade: ${st.speed}` : 'Processando...';
      } else if (st.percent === 100) {
        clearInterval(serverBatchPollInterval);
        serverBatchPollInterval = null;
        isBatchRunning = false;
        els.btnBatchCancel.style.display = 'none';
        els.btnBatchStart.style.display = 'block';
        els.btnBatchStart.disabled = false;
        els.batchProgressTitle.textContent = '🎉 Otimização concluída!';
        els.batchProgressSub.textContent = 'Salvos na mesma pasta com "_otimizado.mp4" prontos para iPhone e PC!';
        toast('🎉 Vídeos otimizados salvos com a tag "_otimizado.mp4"!');
      }
    } catch {
      clearInterval(serverBatchPollInterval);
      serverBatchPollInterval = null;
    }
  }, 1000);
}

// Ouvinte de progresso da otimização no Electron
if (isElectron && window.electronAPI.onBatchProgress) {
  window.electronAPI.onBatchProgress((data) => {
    if (data.status === 'processing') {
      els.batchProgressTitle.textContent = `[${data.currentIndex}/${data.total}] ${data.currentFile}`;
      els.batchProgressPercent.textContent = `${data.percent}%`;
      els.batchProgressFill.style.width = `${data.percent}%`;
      els.batchProgressSub.textContent = data.speed ? `Velocidade: ${data.speed}` : 'Convertendo...';
    }
  });
}

els.btnBatchBrowse?.addEventListener('click', async () => {
  if (isElectron && window.electronAPI.batchSelectFolder) {
    const folder = await window.electronAPI.batchSelectFolder();
    if (folder) {
      els.batchFolderInput.value = folder;
      store.set('batch_folder', folder);
      scanBatchFolder(folder);
    }
  } else {
    toast('No navegador/Safari, a pasta é gerenciada no servidor PC.');
  }
});

els.btnBatchScan?.addEventListener('click', () => {
  scanBatchFolder(els.batchFolderInput.value);
});

els.btnBatchSelectAll?.addEventListener('click', () => {
  els.batchList.querySelectorAll('.batch-checkbox').forEach((cb) => { cb.checked = true; });
  updateBatchStartButton();
});

els.btnBatchSelectNeeded?.addEventListener('click', () => {
  els.batchList.querySelectorAll('.batch-checkbox').forEach((cb) => {
    const v = batchScannedFiles[Number(cb.dataset.index)];
    const isReady = v?.probe?.isIosCompatible ?? v?.isIosCompatible;
    cb.checked = !isReady;
  });
  updateBatchStartButton();
});

els.btnBatchSelectNone?.addEventListener('click', () => {
  els.batchList.querySelectorAll('.batch-checkbox').forEach((cb) => { cb.checked = false; });
  updateBatchStartButton();
});

els.btnBatchStart?.addEventListener('click', startBatchOptimization);

els.btnBatchCancel?.addEventListener('click', () => {
  if (serverBatchPollInterval) {
    clearInterval(serverBatchPollInterval);
    serverBatchPollInterval = null;
  }
  if (isElectron && window.electronAPI.batchCancel) {
    window.electronAPI.batchCancel();
  } else {
    const base = els.serverUrlInput.value || location.origin;
    fetch(`${base}/api/optimize/cancel`, { method: 'POST' }).catch(() => {});
  }
  isBatchRunning = false;
  els.btnBatchCancel.style.display = 'none';
  els.btnBatchStart.style.display = 'block';
  els.btnBatchStart.disabled = false;
  els.batchProgressTitle.textContent = 'Otimização cancelada.';
  toast('Otimização interrompida');
});

async function renderCodecsUI() {
  const container = els.codecDiagnosticsContent;
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--label2);">Carregando diagnóstico...</div>';

  if (!isElectron || !window.electronAPI.getCodecDiagnostics) {
    container.innerHTML = `
      <div class="codec-grid">
        <div class="codec-card">
          <span class="codec-title">Ambiente</span>
          <span class="codec-val">Navegador Web / PWA</span>
          <span class="codec-sub">Safari / WebKit / iOS</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">H.264 (AVC)</span>
          <span class="codec-val badge-green">✔ Suportado</span>
          <span class="codec-sub">Aceleração de hardware</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">HEVC (H.265)</span>
          <span class="codec-val ${video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') ? 'badge-green' : 'badge-orange'}">
            ${video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') ? '✔ Suportado' : 'Depende do aparelho'}
          </span>
          <span class="codec-sub">Até 4K HDR</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">Áudio AAC / MP3</span>
          <span class="codec-val badge-green">✔ Suportado</span>
          <span class="codec-sub">Nativo</span>
        </div>
      </div>
      <p class="sheet-footnote">No iPhone e Safari, use vídeos em formato MP4 ou MOV codificados em H.264 (AVC) com áudio AAC para 100% de compatibilidade.</p>
    `;
    return;
  }

  try {
    const diag = await window.electronAPI.getCodecDiagnostics();
    const canHevc = video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== '';
    const ffmpegOk = diag.tools?.ffmpeg?.available;

    let currentFileOptBtn = '';
    if (state.originalPath) {
      currentFileOptBtn = `
        <div style="margin-top:14px;background:var(--bg2);padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
          <strong style="display:block;font-size:14px;margin-bottom:4px;">Vídeo atual: ${state.fileName}</strong>
          <small style="display:block;color:var(--label2);font-size:12px;margin-bottom:10px;">Caso esteja mudo (áudio AC-3/DTS) ou travando, otimize rapidamente em formato MP4/AAC sem perda de qualidade visual.</small>
          <button id="btn-opt-current" class="btn-primary" style="height:42px;font-size:14px;border-radius:10px;">
            ⚡ Otimizar Áudio/Contêiner deste Vídeo
          </button>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="codec-grid">
        <div class="codec-card">
          <span class="codec-title">Aceleração GPU</span>
          <span class="codec-val badge-green">✔ Ativada</span>
          <span class="codec-sub">Direct3D / WebGL</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">H.264 (AVC)</span>
          <span class="codec-val badge-green">✔ 100% Nativo</span>
          <span class="codec-sub">Aceleração por hardware GPU</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">HEVC (H.265)</span>
          <span class="codec-val ${canHevc ? 'badge-green' : 'badge-orange'}">${canHevc ? '✔ GPU Hardware' : 'Requer Extensão'}</span>
          <span class="codec-sub">Media Foundation</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">VP9 / AV1</span>
          <span class="codec-val badge-green">✔ Suportado</span>
          <span class="codec-sub">libdav1d + GPU</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">Contêineres</span>
          <span class="codec-val badge-green">MP4, MKV, WebM, MOV</span>
          <span class="codec-sub">Range requests nativos</span>
        </div>
        <div class="codec-card">
          <span class="codec-title">Ferramenta FFmpeg</span>
          <span class="codec-val ${ffmpegOk ? 'badge-green' : 'badge-orange'}">${ffmpegOk ? (diag.tools?.ffmpeg?.isBundled ? '✔ Embutido' : '✔ Detectado') : 'Não instalado'}</span>
          <span class="codec-sub">${ffmpegOk ? (diag.tools?.ffmpeg?.isBundled ? '✔ Binário estático integrado' : 'Remux de AC-3/DTS/AVI ativo') : 'Opcional'}</span>
        </div>
      </div>
      <p class="sheet-footnote">
        No executável Windows, a decodificação de vídeo usa aceleração total da sua GPU. Vídeos em MKV, MP4, WebM e MOV abrem nativamente.
      </p>
      ${currentFileOptBtn}
    `;

    const optBtn = $('btn-opt-current');
    if (optBtn) {
      optBtn.addEventListener('click', async () => {
        optBtn.disabled = true;
        optBtn.textContent = '⏳ Otimizando com FFmpeg...';
        toast('Otimizando arquivo em segundo plano...');
        try {
          const res = await window.electronAPI.optimizeMedia(state.originalPath);
          if (res && res.success) {
            toast('✅ Arquivo otimizado! Recarregando...');
            closeSheets();
            openVideoSource({
              url: res.url,
              name: res.name,
              size: res.size,
              isBlob: false,
              originalPath: res.path,
            });
          }
        } catch (e) {
          toast('Falha ao otimizar: ' + e.message);
          optBtn.disabled = false;
          optBtn.textContent = '⚡ Otimizar Áudio/Contêiner deste Vídeo';
        }
      });
    }
  } catch (err) {
    container.innerHTML = `<p class="sheet-footnote">Erro ao obter diagnóstico: ${err.message}</p>`;
  }
}

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

function setAudioSessionType(type) {
  if ('audioSession' in navigator) {
    try {
      navigator.audioSession.type = type;
    } catch {}
  }
}

function playVideo() {
  requestGyroOnce();
  setAudioSessionType('playback');
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

let hlsSeekDebounceTimer = null;

async function seekHls(targetTime) {
  if (!state.isHls || !state.hlsRelPath) return;

  const maxDur = state.totalDuration > 0 ? state.totalDuration : (video.duration || 0);
  const clampedTarget = clamp(targetTime, 0, Math.max(0, maxDur - 0.5));

  clearTimeout(hlsSeekDebounceTimer);

  hud(`Buscando ${fmtTime(clampedTarget)}...`, 5000);
  state.isSeekingHls = true;
  state.hlsOffset = clampedTarget;

  // Atualização visual imediata do display e da barra
  els.tCur.textContent = fmtTime(clampedTarget);
  if (state.totalDuration > 0) {
    els.scrubber.value = Math.round((clampedTarget / state.totalDuration) * 1000);
    setRangeFill(els.scrubber);
  }

  state.hlsSeekEpoch = Date.now();
  const seekUrl = `${state.hlsBaseUrl}/api/hls/seek?path=${encodeURIComponent(state.hlsRelPath)}&ss=${clampedTarget.toFixed(2)}&s=${state.hlsSeekEpoch}`;

  try {
    const res = await fetch(seekUrl, { signal: AbortSignal.timeout(18000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.duration && (!state.totalDuration || state.totalDuration <= 0)) {
      state.totalDuration = data.duration;
      els.tDur.textContent = fmtTime(data.duration);
    }

    const playlistUrl = `${state.hlsBaseUrl}${data.playlistUrl}`;

    // Reconecta o fluxo de reprodução na nova playlist reiniciada a partir de -ss
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS nativo
      video.pause();
      video.src = playlistUrl;
      video.load();
      video.play().catch(() => {});
    } else if (hlsInstance) {
      // Chrome / Edge / PC com hls.js
      hlsInstance.loadSource(playlistUrl);
      video.play().catch(() => {});
    } else {
      video.src = playlistUrl;
      video.load();
      video.play().catch(() => {});
    }

    hud(`Ponto: ${fmtTime(clampedTarget)}`, 1300);
  } catch (err) {
    console.error('[HLS Seek] Falha ao reiniciar FFmpeg:', err);
    hud('Falha ao buscar no vídeo', 2500);
  } finally {
    state.isSeekingHls = false;
  }
}

function seekBy(seconds) {
  const d = state.isHls && state.totalDuration > 0 ? state.totalDuration : video.duration;
  if (!isFinite(d) || d <= 0) return;
  const cur = (state.isHls ? state.hlsOffset : 0) + (video.currentTime || 0);
  const target = clamp(cur + seconds, 0, d - 0.5);

  if (state.isHls) {
    seekHls(target);
  } else {
    video.currentTime = target;
    hud(seconds > 0 ? `+${seconds} s` : `${seconds} s`);
  }
  scheduleHide();
}

function handleTap() {
  if (settingsPill?.isOpen()) {
    settingsPill.close();
    return;
  }
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
  setAudioSessionType('playback');
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
  setAudioSessionType('ambient');
});
video.addEventListener('ended', () => {
  els.player.classList.add('paused');
  setPlayIcon(false);
  setAudioSessionType('ambient');
});
video.addEventListener('loadedmetadata', () => {
  if (vr) vr.updatePlane();
  if (state.isHls && state.totalDuration > 0) {
    els.tDur.textContent = fmtTime(state.totalDuration);
  }
});
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
  if (state.scrubbing || !state.controlsVisible || state.isSeekingHls) return;
  const d = state.isHls && state.totalDuration > 0 ? state.totalDuration : video.duration;
  const t = (state.isHls ? state.hlsOffset : 0) + (video.currentTime || 0);
  if (isFinite(d) && d > 0) {
    els.scrubber.value = Math.round((clamp(t, 0, d) / d) * 1000);
    setRangeFill(els.scrubber);
  }
  const sec = Math.floor(t);
  if (sec !== lastShownSecond) {
    lastShownSecond = sec;
    els.tCur.textContent = fmtTime(t);
    if (isFinite(d) && d > 0) {
      els.tDur.textContent = fmtTime(d);
    }
  }
}

els.scrubber.addEventListener('input', () => {
  state.scrubbing = true;
  clearTimeout(hideTimer);
  const d = state.isHls && state.totalDuration > 0 ? state.totalDuration : video.duration;
  if (!isFinite(d) || d <= 0) return;
  const t = (els.scrubber.value / 1000) * d;
  if (!state.isHls) {
    if (typeof video.fastSeek === 'function') video.fastSeek(t);
    else video.currentTime = t;
  }
  els.tCur.textContent = fmtTime(t);
  setRangeFill(els.scrubber);
});

els.scrubber.addEventListener('change', () => {
  const d = state.isHls && state.totalDuration > 0 ? state.totalDuration : video.duration;
  if (isFinite(d) && d > 0) {
    const t = (els.scrubber.value / 1000) * d;
    if (state.isHls) {
      seekHls(t);
    } else {
      if (typeof video.fastSeek === 'function') video.fastSeek(t);
      else video.currentTime = t;
    }
  }
  state.scrubbing = false;
  scheduleHide();
});

// ---------------- Controles visíveis / ocultos ----------------
let hideTimer = null;
function setControlsVisible(visible) {
  if (settingsPill?.isOpen()) {
    els.controls.classList.add('hidden');
    state.controlsVisible = false;
    return;
  }
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
    if (!video.paused && !sheetOpen() && !settingsPill?.isOpen() && !state.scrubbing) setControlsVisible(false);
  }, 3500);
}

els.controls.addEventListener('pointerdown', () => scheduleHide(), true);

// ---------------- Modo Óculos ----------------
let isSyncingHomeScroll = false;
let homeMirrorInitialized = false;

function syncHomeStereo() {
  if (!els.homePanePrimary || !els.homePaneMirror) return;
  if (!state.headset) {
    els.homePaneMirror.hidden = true;
    return;
  }

  els.homePaneMirror.hidden = false;
  els.homePaneMirror.innerHTML = els.homePanePrimary.innerHTML;

  // Sincroniza rolagem entre ambos os olhos na tela inicial
  if (!homeMirrorInitialized) {
    homeMirrorInitialized = true;
    els.homePanePrimary.addEventListener('scroll', () => {
      if (!state.headset || isSyncingHomeScroll || !els.homePaneMirror) return;
      isSyncingHomeScroll = true;
      els.homePaneMirror.scrollTop = els.homePanePrimary.scrollTop;
      isSyncingHomeScroll = false;
    }, { passive: true });

    els.homePaneMirror.addEventListener('scroll', () => {
      if (!state.headset || isSyncingHomeScroll || !els.homePanePrimary) return;
      isSyncingHomeScroll = true;
      els.homePanePrimary.scrollTop = els.homePaneMirror.scrollTop;
      isSyncingHomeScroll = false;
    }, { passive: true });

    // Delegação de cliques do espelho direito para o painel principal
    els.homePaneMirror.addEventListener('click', (e) => {
      const btn = e.target.closest('button, label, a, .recent-card, .cloud-history-card, .chip, [role="tab"]');
      if (!btn) return;
      if (btn.id === 'btn-home-headset') {
        setHeadset(!state.headset);
        return;
      }
      if (btn.getAttribute('for') === 'file-input') {
        $('file-input')?.click();
        return;
      }
      if (btn.id) {
        const orig = $(btn.id);
        if (orig && orig !== btn) {
          orig.click();
          return;
        }
      }
      if (btn.dataset.path) {
        const orig = els.homePanePrimary.querySelector(`[data-path="${CSS.escape(btn.dataset.path)}"]`);
        if (orig) { orig.click(); return; }
      }
      if (btn.dataset.url) {
        const orig = els.homePanePrimary.querySelector(`[data-url="${CSS.escape(btn.dataset.url)}"]`);
        if (orig) { orig.click(); return; }
      }
    });
  }

  els.homePaneMirror.scrollTop = els.homePanePrimary.scrollTop;
}

let isSyncingFormatScroll = false;
let formatMirrorInitialized = false;

function syncFormatStereo() {
  if (!els.formatPaneLeft || !els.formatPaneRight) return;
  if (!state.headset) {
    els.formatPaneRight.hidden = true;
    return;
  }

  els.formatPaneRight.hidden = false;
  els.formatPaneRight.innerHTML = els.formatPaneLeft.innerHTML;

  if (!formatMirrorInitialized) {
    formatMirrorInitialized = true;

    els.formatPaneLeft.addEventListener('scroll', () => {
      if (!state.headset || isSyncingFormatScroll || !els.formatPaneRight) return;
      isSyncingFormatScroll = true;
      els.formatPaneRight.scrollTop = els.formatPaneLeft.scrollTop;
      isSyncingFormatScroll = false;
    }, { passive: true });

    els.formatPaneRight.addEventListener('scroll', () => {
      if (!state.headset || isSyncingFormatScroll || !els.formatPaneLeft) return;
      isSyncingFormatScroll = true;
      els.formatPaneLeft.scrollTop = els.formatPaneRight.scrollTop;
      isSyncingFormatScroll = false;
    }, { passive: true });

    els.formatPaneRight.addEventListener('click', (e) => {
      const b = e.target.closest('button, input, label');
      if (!b) return;

      if (b.dataset.close !== undefined || b.classList.contains('sheet-done')) {
        closeSheets();
        return;
      }
      if (b.dataset.value) {
        const orig = els.formatPaneLeft.querySelector(`button[data-value="${b.dataset.value}"]`);
        if (orig) {
          orig.click();
          syncFormatStereo();
          return;
        }
      }
      if (b.dataset.fov) {
        const orig = els.formatPaneLeft.querySelector(`button[data-fov="${b.dataset.fov}"]`);
        if (orig) {
          orig.click();
          syncFormatStereo();
          return;
        }
      }
      if (b.classList.contains('chip')) {
        const chipsRight = Array.from(els.formatPaneRight.querySelectorAll('.chip'));
        const idx = chipsRight.indexOf(b);
        const chipsLeft = Array.from(els.formatPaneLeft.querySelectorAll('.chip'));
        if (chipsLeft[idx]) {
          chipsLeft[idx].click();
          syncFormatStereo();
          return;
        }
      }
      if (b.id) {
        const orig = els.formatPaneLeft.querySelector(`#${b.id}`);
        if (orig && orig !== b) {
          orig.click();
          syncFormatStereo();
          return;
        }
      }
    });

    els.formatPaneRight.addEventListener('input', (e) => {
      const input = e.target.closest('input');
      if (!input || !input.id) return;
      const orig = els.formatPaneLeft.querySelector(`#${input.id}`);
      if (orig && orig !== input) {
        orig.value = input.value;
        orig.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  els.formatPaneRight.scrollTop = els.formatPaneLeft.scrollTop;
}

function setHeadset(on) {
  state.headset = on;
  store.set('vr_mode', on);
  document.body.classList.toggle('headset-mode', on);
  els.home?.classList.toggle('headset', on);
  els.btnHomeHeadset?.classList.toggle('active', on);
  if (els.btnHomeHeadset) {
    const label = els.btnHomeHeadset.querySelector('.btn-headset-label');
    if (label) label.textContent = on ? 'Modo Óculos: ON' : 'Modo Óculos';
  }

  if (els.player.hidden) {
    syncHomeStereo();
  }

  if (vr) {
    vr.setHeadset(on);
  }
  if (look) {
    look.headsetMode = on;
    look.immediateTap = on && !state.unlocked;
  }
  els.player.classList.toggle('headset', on);
  els.btnHeadset?.classList.toggle('active', on);

  if (settingsPill?.isOpen()) {
    settingsPill.render(true);
  }

  if (on) {
    requestGyroOnce();
    if (!els.player.hidden) {
      closeSheets();
      setControlsVisible(false);
      look?.recenter();
      if (gamepad?.connected) {
        hud('Controle conectado\nA: Play/Pause · B/Y: Centralizar · ◀ ▶: Pular', 4500);
      } else {
        hud('Toque: reproduzir/pausar\nToque duplo: menu · Segurar: centralizar', 4000);
      }
      if (video.paused) playVideo();
    }
  } else {
    if (!els.player.hidden) {
      setControlsVisible(true);
    }
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
  if (document.visibilityState === 'hidden') {
    // Ao minimizar o Safari / mudar de app (ex: WhatsApp) / bloquear a tela:
    // Pausa a reprodução e libera a sessão exclusiva de áudio para evitar conflitos no iOS
    if (!video.paused) {
      video.pause();
    }
    releaseWakeLock();
    setAudioSessionType('ambient');
  } else if (document.visibilityState === 'visible') {
    if (!video.paused) acquireWakeLock();
  }
});

window.addEventListener('pagehide', () => {
  try {
    if (!video.paused) video.pause();
  } catch {}
  releaseWakeLock();
  setAudioSessionType('ambient');
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
  setHeadset(state.headset);
  vr.resize();
  look.recenter();
  look.immediateTap = state.headset && !state.unlocked;
  startLoop();
}

function releaseVideo() {
  state.isHls = false;
  state.hlsOffset = 0;
  state.totalDuration = 0;
  state.hlsRelPath = null;
  state.isSeekingHls = false;
  state.hlsSeekEpoch = 0;
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch {}
    hlsInstance = null;
  }
  try {
    video.pause();
    video.muted = true; // Desconecta o decodificador de áudio do WebKit
    video.removeAttribute('src');
    video.src = '';
    video.load();
  } catch {}
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
  video.muted = false;
  setAudioSessionType('ambient');
}

function closePlayer() {
  closeSheets();
  stopLoop();
  releaseVideo();
  releaseWakeLock();
  setAudioSessionType('ambient');
  els.player.hidden = true;
  els.home.hidden = false;
  setHeadset(state.headset);
}

// ---------------- Servidor no PC & Biblioteca Local ----------------
function renderMonitoredFolders(folders) {
  if (!els.monitoredFoldersList) return;
  els.monitoredFoldersList.innerHTML = '';
  if (!folders || !folders.length) {
    els.monitoredFoldersList.innerHTML = '<span style="font-size:12px;color:#8e8e93;">Nenhuma pasta configurada</span>';
    return;
  }
  for (const f of folders) {
    const folderPath = typeof f === 'string' ? f : f.path;
    const exists = typeof f === 'object' ? f.exists : true;
    const pill = document.createElement('span');
    pill.className = 'server-pill';
    pill.style.cssText = `font-size:12px;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;${!exists ? 'opacity:0.6;border:1px dashed #ff453a;' : ''}`;
    pill.title = exists ? folderPath : `${folderPath} (pasta não encontrada no disco)`;

    const baseName = folderPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || folderPath;
    pill.innerHTML = `📁 <b>${baseName}</b> <span style="font-size:10px;opacity:0.7;">(${folderPath})</span>`;

    if (isElectron && window.electronAPI.removeLibraryFolder) {
      const delBtn = document.createElement('button');
      delBtn.innerHTML = '×';
      delBtn.style.cssText = 'background:none;border:none;color:#ff453a;font-size:14px;cursor:pointer;margin-left:4px;line-height:1;padding:0 2px;';
      delBtn.title = 'Remover esta pasta do VR Player';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const updated = await window.electronAPI.removeLibraryFolder(folderPath);
        if (updated) renderElectronLibrary(updated);
      });
      pill.appendChild(delBtn);
    }

    if (isElectron && window.electronAPI.openFolderInExplorer) {
      pill.style.cursor = 'pointer';
      pill.addEventListener('click', () => {
        window.electronAPI.openFolderInExplorer(folderPath);
      });
    }

    els.monitoredFoldersList.appendChild(pill);
  }
}

async function loadElectronLibrary() {
  if (!isElectron || !window.electronAPI.getLibrary) return;
  try {
    const data = await window.electronAPI.getLibrary();
    renderElectronLibrary(data);
  } catch (err) {
    console.error('Erro ao ler biblioteca Electron:', err);
  }
}

function renderElectronLibrary(data) {
  if (!data) return;
  renderMonitoredFolders(data.folders || []);
  renderPcVideos(data.videos || [], '');
}

async function connectServer(rawUrl, silent = false) {
  let url = (rawUrl || '').trim();
  if (!url) {
    if (!silent) toast('Digite o endereço do servidor (ex: https://vrplayer.local:8443)');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    url = (location.protocol === 'https:' ? 'https://' : 'http://') + url;
  }
  url = url.replace(/\/+$/, '');
  els.serverUrlInput.value = url;

  els.btnConnectServer.textContent = '...';
  try {
    const res = await fetch(`${url}/api/videos`, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) throw new Error('Status ' + res.status);
    const data = await res.json();
    store.set('server_url', url);
    els.btnConnectServer.textContent = 'Conectado';
    els.btnConnectServer.classList.add('connected');
    const folderList = data.folders || (data.folder ? [data.folder] : []);
    renderMonitoredFolders(folderList);
    renderPcVideos(data.videos || [], url);
    if (!silent) toast(`Conectado! ${data.count} vídeo(s) encontrado(s).`);
  } catch (err) {
    els.btnConnectServer.textContent = 'Conectar';
    els.btnConnectServer.classList.remove('connected');
    els.pcVideoList.hidden = true;
    if (!silent) {
      toast('Não foi possível conectar. Verifique o IP/domínio, porta e o certificado HTTPS.');
    }
  }
}

async function discoverAndConnectServer(silent = false) {
  if (els.btnDiscoverServer) els.btnDiscoverServer.textContent = 'Buscando servidor...';
  const candidates = [];
  if (location.origin && !location.origin.startsWith('file:') && !location.origin.includes('null')) {
    candidates.push(location.origin);
  }
  candidates.push(
    'https://localhost:8443',
    'http://localhost:8080',
    'https://vrplayer.local:8443',
    'http://vrplayer.local:8080'
  );

  for (const candidate of candidates) {
    if (!candidate || candidate.startsWith('file:')) continue;
    try {
      const res = await fetch(`${candidate}/api/videos`, { signal: AbortSignal.timeout(2200) });
      if (res.ok) {
        const data = await res.json();
        els.serverUrlInput.value = candidate;
        store.set('server_url', candidate);
        els.btnConnectServer.textContent = 'Conectado';
        els.btnConnectServer.classList.add('connected');
        if (els.btnDiscoverServer) {
          els.btnDiscoverServer.innerHTML = '<svg style="width:15px;height:15px;margin-right:6px;"><use href="#i-sparkles"/></svg> Servidor Conectado!';
        }
        const folderList = data.folders || (data.folder ? [data.folder] : []);
        renderMonitoredFolders(folderList);
        renderPcVideos(data.videos || [], candidate);
        if (!silent) toast(`✅ Conectado automaticamente ao servidor (${data.count} vídeos)!`);
        return true;
      }
    } catch {}
  }

  if (els.btnDiscoverServer) {
    els.btnDiscoverServer.innerHTML = '<svg style="width:15px;height:15px;margin-right:6px;"><use href="#i-sparkles"/></svg> Buscar Servidor na Rede';
  }
  if (!silent) toast('Servidor local não respondeu. Certifique-se de que o servidor está rodando.');
  return false;
}

function renderPcVideos(videos, baseUrl) {
  const container = els.pcVideoList;
  container.innerHTML = '';
  if (!videos || videos.length === 0) {
    container.innerHTML = '<div class="list-item" style="grid-column:1/-1;border-radius:12px;"><div class="list-text"><small>Nenhum vídeo encontrado na pasta do PC.</small></div></div>';
    container.hidden = false;
    return;
  }

  for (const v of videos) {
    const card = document.createElement('div');
    card.className = 'video-card';

    const hint = v.formatHint || {};
    let iconLabel = 'VR';
    let iconColor = '#0a84ff';
    if (hint.projection === '360') { iconLabel = '360°'; iconColor = '#0a84ff'; }
    else if (hint.projection === '180') { iconLabel = 'VR180'; iconColor = '#5e5ce6'; }
    else if (hint.projection === 'fisheye') { iconLabel = 'Olho de Peixe'; iconColor = '#ff9f0a'; }
    else if (hint.layout === 'sbs' || hint.layout === 'tb') { iconLabel = '3D SBS'; iconColor = '#30d158'; }
    else if (hint.projection === 'flat') { iconLabel = 'Plano'; iconColor = '#64d2ff'; }

    const isHls = v.streamType === 'hls' || v.url?.includes('.m3u8');
    let streamBadge = '';
    if (isHls) {
      if (v.needsDownscale) {
        streamBadge = '<span class="video-card-stream-badge badge-orange" style="background:rgba(255,159,10,0.2);color:#ff9f0a;">8K➔4K HLS</span>';
      } else {
        streamBadge = '<span class="video-card-stream-badge badge-purple" style="background:rgba(191,90,242,0.2);color:#bf5af2;">HLS GPU</span>';
      }
    } else {
      streamBadge = '<span class="video-card-stream-badge badge-green" style="background:rgba(48,209,88,0.2);color:#30d158;">Direto</span>';
    }

    const resBadge = v.resolutionBadge ? `<span class="badge-res ${v.resolutionBadge === '8K' ? 'res-8k' : ''}">${v.resolutionBadge}</span>` : '';
    const durBadge = v.durationFormatted ? `<span class="badge-duration">${v.durationFormatted}</span>` : '';
    const thumbSrc = v.thumbUrl ? `${baseUrl}${v.thumbUrl}` : '';

    card.innerHTML = `
      <div class="video-card-thumb-wrap">
        <img class="video-card-thumb" src="${thumbSrc}" alt="${v.name}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'">
        <div class="video-thumb-shimmer"></div>
        <div class="video-card-badges">
          <span class="badge-format" style="background:${iconColor}cc">${iconLabel}</span>
          ${resBadge}
        </div>
        ${durBadge}
      </div>
      <div class="video-card-info">
        <strong class="video-card-title" title="${v.name}">${v.name}</strong>
        <div class="video-card-meta">
          <span>${v.size}</span>
          ${streamBadge}
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      const fullUrl = `${baseUrl}${v.url}`;
      if (isHls) {
        hud(v.needsDownscale ? 'Transcodificando 8K ➔ 4K HLS...' : 'Iniciando HLS Dinâmico...');
      }
      openVideoSource({
        url: fullUrl,
        name: v.name,
        size: v.sizeBytes,
        isBlob: false,
        duration: v.duration || 0,
        isHls,
        relPath: v.relPath,
        baseUrl,
      });
    });

    container.appendChild(card);
  }
  container.hidden = false;
}

els.btnConnectServer?.addEventListener('click', () => connectServer(els.serverUrlInput.value));
els.btnDiscoverServer?.addEventListener('click', () => discoverAndConnectServer(false));
els.btnTelemetry?.addEventListener('click', toggleTelemetry);

document.querySelectorAll('.server-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    const target = pill.dataset.target;
    if (target) {
      els.serverUrlInput.value = target;
      connectServer(target);
    }
  });
});

els.serverUrlInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') connectServer(els.serverUrlInput.value);
});

// ---------------- Reprodução na Nuvem (Torbox & Gofile) ----------------

function getCurrentServerUrl() {
  const saved = store.get('server_url');
  if (saved) return saved;
  if (els.serverUrlInput && els.serverUrlInput.value) {
    const val = els.serverUrlInput.value.trim().replace(/\/+$/, '');
    if (val && !val.includes('vrplayer.local')) return val;
  }
  if (!location.hostname.endsWith('github.io') && location.protocol.startsWith('http')) {
    return location.origin;
  }
  return '';
}

function switchCloudTab(tabName) {
  const tabs = [
    { name: 'link', tab: els.tabCloudLink, panel: els.cloudPanelLink },
    { name: 'torbox', tab: els.tabCloudTorbox, panel: els.cloudPanelTorbox },
    { name: 'history', tab: els.tabCloudHistory, panel: els.cloudPanelHistory },
  ];
  for (const t of tabs) {
    if (!t.tab || !t.panel) continue;
    const isActive = t.name === tabName;
    t.tab.classList.toggle('active', isActive);
    t.tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.panel.hidden = !isActive;
  }
  if (tabName === 'history') {
    renderCloudHistory();
  } else if (tabName === 'torbox') {
    const key = getTorboxApiKey();
    if (key && !els.torboxTorrentList.children.length) {
      loadTorboxTorrents();
    }
  }
}

function playCloudVideo(rawUrl, title, options = {}) {
  const serverUrl = getCurrentServerUrl();
  state.currentCloudUrl = rawUrl;
  state.currentCloudTitle = title;
  state.currentCloudOptions = options;

  const prep = preparePlayableUrl({
    directUrl: rawUrl,
    filename: title,
    serverUrl,
    forceTranscode: options.forceTranscode || false,
    forceDownscale: options.forceDownscale || false,
  });

  if (prep.warning) {
    toast(prep.warning);
  }

  // Registra no histórico recente de nuvem
  addToCloudHistory({
    name: title,
    url: rawUrl,
    streamUrl: prep.url,
    sizeFormatted: options.sizeFormatted || 'Nuvem',
    sizeBytes: options.sizeBytes || 0,
    formatHint: options.formatHint || detectFromName(title),
    service: options.service || 'direto',
  });
  renderCloudHistory();

  hud(options.forceDownscale ? '⚡ Transmitindo 4K Suave com GPU...' : 'Abrindo vídeo da nuvem...');
  state.cloudFallbackTried = false;
  openVideoSource({
    url: prep.url,
    name: title,
    size: options.sizeBytes || 0,
    isBlob: false,
    duration: 0,
    isHls: prep.url.includes('.m3u8') || prep.url.includes('/hls/'),
  });
}

async function handleCloudLinkPlay(options = {}) {
  const forceDownscale = !!options.forceDownscale;
  const rawInput = (els.cloudUrlInput?.value || '').trim();
  if (!rawInput) {
    toast('Cole uma URL do Gofile, Torbox, link direto de vídeo ou magnet.');
    return;
  }

  // 0. Se for link Magnet
  if (rawInput.startsWith('magnet:?')) {
    const key = getTorboxApiKey();
    if (!key) {
      toast('Para baixar/assistir links magnet, configure sua API Key na aba Torbox.');
      switchCloudTab('torbox');
      return;
    }
    const serverUrl = getCurrentServerUrl();
    els.btnCloudPlay.textContent = 'Enviando...';
    try {
      await addTorboxMagnet(rawInput, key, serverUrl);
      els.btnCloudPlay.textContent = 'Assistir';
      toast('✅ Magnet adicionado ao Torbox! Atualizando lista...');
      switchCloudTab('torbox');
      loadTorboxTorrents();
    } catch (err) {
      els.btnCloudPlay.textContent = 'Assistir';
      toast('Erro no Torbox: ' + err.message);
    }
    return;
  }

  // 1. Se for link DIRETO de download de servidor Gofile (srv-fileX... /download/...), reproduz imediatamente!
  if (rawInput.includes('.gofile.io/download/') || rawInput.includes('/download/web/')) {
    let filename = 'Vídeo Gofile';
    try {
      filename = decodeURIComponent(new URL(rawInput).pathname.split('/').pop() || 'video.mp4');
    } catch {}
    playCloudVideo(rawInput, filename, { service: 'gofile', forceDownscale });
    return;
  }

  // 2. Se for link de pasta/compartilhamento do Gofile (gofile.io/d/...)
  if (rawInput.includes('gofile.io') || (!rawInput.startsWith('http') && /^[a-zA-Z0-9_-]{5,15}$/.test(rawInput))) {
    els.btnCloudPlay.textContent = '...';
    hud('Consultando Gofile...');
    try {
      const serverUrl = getCurrentServerUrl();
      const gofileToken = getGofileApiKey();
      const res = await resolveGofileLink(rawInput, serverUrl, gofileToken);
      els.btnCloudPlay.textContent = 'Assistir';
      if (!res.files || res.files.length === 0) {
        toast('Nenhum vídeo encontrado nesta pasta do Gofile.');
        return;
      }
      if (res.files.length === 1) {
        const f = res.files[0];
        playCloudVideo(f.link, f.name, {
          sizeFormatted: f.sizeFormatted,
          sizeBytes: f.sizeBytes,
          formatHint: f.formatHint,
          service: 'gofile',
          forceDownscale,
        });
      } else {
        showCloudFilesModal(res.folderName || 'Gofile', `${res.files.length} vídeos disponíveis`, res.files, (file, itemDownscale) => {
          playCloudVideo(file.link, file.name, {
            sizeFormatted: file.sizeFormatted,
            sizeBytes: file.sizeBytes,
            formatHint: file.formatHint,
            service: 'gofile',
            forceDownscale: itemDownscale !== undefined ? itemDownscale : forceDownscale,
          });
        });
      }
    } catch (err) {
      els.btnCloudPlay.textContent = 'Assistir';
      showGofileHelpModal(rawInput, err.message);
    }
    return;
  }

  // URL Direta (MP4, HLS, WebM, Torbox direct download link, etc.)
  let filename = 'Vídeo Online';
  try {
    const p = new URL(rawInput).pathname;
    const base = decodeURIComponent(p.split('/').pop() || '');
    if (base && base.length > 2) filename = base;
  } catch {}

  const isTorbox = rawInput.includes('torbox.app');
  playCloudVideo(rawInput, filename, {
    sizeFormatted: 'Nuvem',
    service: isTorbox ? 'torbox' : 'direto',
    forceDownscale,
  });
}

function showGofileHelpModal(url, errorMsg) {
  if (!els.sheetCloudFiles) {
    toast(errorMsg);
    return;
  }
  els.sheetCloudFilesTitle.textContent = 'Link de Pasta do Gofile';
  els.sheetCloudFilesSub.textContent = 'Como assistir esse vídeo sem erros';
  const hasTorbox = !!getTorboxApiKey();
  const currentToken = getGofileApiKey();

  els.cloudFilesListContainer.innerHTML = `
    <div style="padding:10px 4px;font-size:13px;line-height:1.55;color:var(--label);">
      <div style="background:rgba(255,159,10,0.15);border:1px solid rgba(255,159,10,0.3);padding:10px 12px;border-radius:10px;color:#ff9f0a;margin-bottom:14px;">
        ⚠️ A API do Gofile bloqueou a listagem da pasta: <em>${errorMsg}</em>
      </div>

      ${hasTorbox ? `
        <div style="background:rgba(175,82,222,0.15);border:1px solid rgba(175,82,222,0.4);border-radius:12px;padding:12px;margin-bottom:14px;">
          <h4 style="margin:0 0 6px 0;color:#bf5af2;font-size:13px;display:flex;align-items:center;gap:6px;">
            <span>⚡</span> Método 1 (Recomendado): Baixar na Nuvem via Torbox
          </h4>
          <p style="margin:0 0 10px 0;font-size:12px;color:var(--label2);">Sua conta Torbox baixa essa pasta do Gofile direto para sua nuvem em segundos sem usar seu computador!</p>
          <button id="btn-gofile-send-torbox" class="btn-primary" style="font-size:13px;font-weight:600;padding:9px 14px;width:100%;background:#af52de;">
            ⚡ Adicionar este link ao meu Torbox agora
          </button>
        </div>
      ` : ''}

      <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;margin-bottom:14px;">
        <h4 style="margin:0 0 6px 0;color:#fff;font-size:13px;">💡 ${hasTorbox ? 'Método 2' : 'Método 1'}: Pegar o Link Direto de Download</h4>
        <ol style="margin:0;padding-left:18px;color:var(--label2);font-size:12px;">
          <li style="margin-bottom:5px;">Abra a página do link no Gofile pelo seu navegador.</li>
          <li style="margin-bottom:5px;">Clique com o <strong>botão direito</strong> (ou <strong>segure o dedo</strong> no celular) no botão <strong>Download</strong> do vídeo.</li>
          <li style="margin-bottom:5px;">Selecione <strong>"Copiar endereço do link"</strong>.</li>
          <li>Cole esse link aqui e clique em <strong>Assistir</strong> (ou <strong>⚡ 4K Suave</strong> se for 8K)! O servidor do PC transmitirá na hora com cabeçalhos autorizados.</li>
        </ol>
      </div>

      <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;">
        <h4 style="margin:0 0 6px 0;color:#fff;font-size:13px;">🔑 ${hasTorbox ? 'Método 3' : 'Método 2'}: Informar Token de Conta do Gofile</h4>
        <p style="margin:0 0 8px 0;font-size:12px;color:var(--label2);">Se você tem uma conta no Gofile, copie seu token em <em>gofile.io/myprofile</em>:</p>
        <div style="display:flex;gap:6px;">
          <input id="modal-gofile-token-input" type="password" value="${currentToken}" placeholder="Cole seu token do Gofile..." class="server-input" style="font-size:12px;padding:6px 10px;flex:1;">
          <button id="btn-save-modal-gofile-token" class="btn-connect" style="font-size:12px;padding:6px 12px;">Salvar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-gofile-send-torbox')?.addEventListener('click', async () => {
    closeSheets();
    toast('Enviando link para Torbox...');
    try {
      const serverUrl = getCurrentServerUrl();
      await addTorboxWebDownload(url, getTorboxApiKey(), serverUrl);
      toast('✅ Adicionado ao Torbox! Veja na aba Torbox.');
      switchCloudTab('torbox');
      loadTorboxTorrents();
    } catch (e) {
      toast('Erro no Torbox: ' + e.message);
    }
  });

  document.getElementById('btn-save-modal-gofile-token')?.addEventListener('click', () => {
    const val = (document.getElementById('modal-gofile-token-input')?.value || '').trim();
    setGofileApiKey(val);
    toast(val ? 'Token do Gofile salvo!' : 'Token removido.');
    closeSheets();
    handleCloudLinkPlay();
  });

  openSheet(els.sheetCloudFiles);
}

function showCloudFilesModal(title, subtitle, files, onSelect) {
  if (!els.sheetCloudFiles) return;
  els.sheetCloudFilesTitle.textContent = title;
  els.sheetCloudFilesSub.textContent = subtitle;
  els.cloudFilesListContainer.innerHTML = '';

  const serverUrl = getCurrentServerUrl();

  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'cloud-file-row';
    row.style.marginBottom = '8px';

    const hint = f.formatHint || detectFromName(f.name);
    let hintTag = 'VR';
    if (hint.projection === '360') hintTag = '360°';
    else if (hint.projection === '180') hintTag = '180°';
    else if (hint.projection === 'fisheye') hintTag = 'Fish';
    else if (hint.layout === 'sbs') hintTag = 'SBS';

    row.innerHTML = `
      <div style="flex:1;overflow:hidden;padding-right:8px;">
        <div style="font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">${f.name}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
          <span class="cloud-tag">${f.sizeFormatted || 'Nuvem'}</span>
          <span class="cloud-tag tag-completed">${hintTag}</span>
          ${f.isMkv ? '<span class="cloud-tag tag-torbox">MKV</span>' : ''}
        </div>
      </div>
      <div class="cloud-file-actions">
        <button class="btn-cloud-action btn-play">▶ Assistir</button>
        ${serverUrl ? '<button class="btn-cloud-action btn-play-4k" style="background:#5856d6;color:#fff;" title="4K Suave com GPU do PC (Sem baixar!)">⚡ 4K Suave</button>' : ''}
        ${serverUrl ? '<button class="btn-cloud-action btn-download-pc" title="Baixar no PC">↓ PC</button>' : ''}
      </div>
    `;

    row.querySelector('.btn-play')?.addEventListener('click', () => {
      closeSheets();
      onSelect(f, false);
    });

    row.querySelector('.btn-play-4k')?.addEventListener('click', () => {
      closeSheets();
      onSelect(f, true);
    });

    row.querySelector('.btn-download-pc')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        toast(`Iniciando download no PC: ${f.name}...`);
        await sendDownloadToPc(f.link, f.name, serverUrl);
        toast(`Download em andamento no PC!`);
      } catch (err) {
        toast(`Falha ao baixar no PC: ${err.message}`);
      }
    });

    els.cloudFilesListContainer.appendChild(row);
  }

  openSheet(els.sheetCloudFiles);
}

async function loadTorboxTorrents() {
  const key = (els.torboxKeyInput?.value || '').trim() || getTorboxApiKey();
  if (!key) {
    toast('Digite sua API Key do Torbox e clique em Salvar.');
    return;
  }

  const serverUrl = getCurrentServerUrl();
  if (els.btnTorboxRefresh) els.btnTorboxRefresh.textContent = 'Carregando torrents...';
  try {
    const torrents = await fetchTorboxTorrents(key, serverUrl);
    if (els.btnTorboxRefresh) els.btnTorboxRefresh.innerHTML = '<svg style="width:15px;height:15px;margin-right:6px;"><use href="#i-sparkles"/></svg> Carregar Meus Torrents';
    renderTorboxTorrents(torrents, key);
  } catch (err) {
    if (els.btnTorboxRefresh) els.btnTorboxRefresh.innerHTML = '<svg style="width:15px;height:15px;margin-right:6px;"><use href="#i-sparkles"/></svg> Carregar Meus Torrents';
    toast('Erro no Torbox: ' + err.message);
  }
}

function renderTorboxTorrents(torrents, apiKey) {
  const container = els.torboxTorrentList;
  if (!container) return;
  container.innerHTML = '';

  const serverUrl = getCurrentServerUrl();
  const validTorrents = torrents.filter((t) => t.hasVideos);

  if (validTorrents.length === 0) {
    container.hidden = true;
    if (els.torboxEmptyMsg) els.torboxEmptyMsg.hidden = false;
    return;
  }

  if (els.torboxEmptyMsg) els.torboxEmptyMsg.hidden = true;

  for (const t of validTorrents) {
    const card = document.createElement('div');
    card.className = 'cloud-torrent-card';

    const isComplete = t.progress >= 1 || t.state === 'completed';

    let filesHtml = '';
    for (const f of t.videoFiles) {
      filesHtml += `
        <div class="cloud-file-row" data-file-id="${f.fileId}" data-torrent-id="${t.id}" data-name="${f.name}" data-type="${f.type || t.type || 'torrent'}">
          <div class="cloud-file-name" title="${f.name}">${f.name}</div>
          <div class="cloud-file-actions">
            <span class="cloud-tag">${f.sizeFormatted}</span>
            <button class="btn-cloud-action btn-play btn-play-torbox">▶ Assistir</button>
            ${serverUrl ? '<button class="btn-cloud-action btn-play-torbox-4k" style="background:#5856d6;color:#fff;" title="Transmite em 4K suave usando a GPU do seu PC em tempo real (Sem baixar!)">⚡ 4K Suave</button>' : ''}
            ${serverUrl ? '<button class="btn-cloud-action btn-download-pc btn-dl-torbox" title="Baixar na biblioteca do PC">↓ PC</button>' : ''}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="cloud-torrent-head">
        <strong class="cloud-torrent-name">${t.name}</strong>
        <div class="cloud-torrent-badges">
          <span class="cloud-tag ${t.type === 'webdl' ? 'tag-gofile' : 'tag-torbox'}">${t.typeLabel || 'Torbox'}</span>
          <span class="cloud-tag ${isComplete ? 'tag-completed' : ''}">${isComplete ? 'Pronto' : Math.round(t.progress * 100) + '%'}</span>
        </div>
      </div>
      <div class="cloud-torrent-files">${filesHtml}</div>
    `;

    // Ações para cada arquivo de vídeo do torrent ou web download
    card.querySelectorAll('.btn-play-torbox').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const row = btn.closest('.cloud-file-row');
        const fileId = row.dataset.fileId;
        const torrentId = row.dataset.torrentId;
        const name = row.dataset.name;
        const type = row.dataset.type || 'torrent';
        btn.textContent = '...';
        hud('Gerando link do Torbox...');
        try {
          const streamUrl = await requestTorboxStreamUrl(torrentId, fileId, apiKey, type, serverUrl);
          btn.textContent = '▶ Assistir';
          playCloudVideo(streamUrl, name, {
            sizeFormatted: t.totalSize,
            service: 'torbox',
          });
        } catch (err) {
          btn.textContent = '▶ Assistir';
          toast('Falha ao obter stream: ' + err.message);
        }
      });
    });

    // Ação ⚡ 4K Suave (GPU em tempo real, sem baixar no PC!)
    card.querySelectorAll('.btn-play-torbox-4k').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const row = btn.closest('.cloud-file-row');
        const fileId = row.dataset.fileId;
        const torrentId = row.dataset.torrentId;
        const name = row.dataset.name;
        const type = row.dataset.type || 'torrent';
        btn.textContent = '...';
        hud('Gerando stream 4K GPU...');
        try {
          const streamUrl = await requestTorboxStreamUrl(torrentId, fileId, apiKey, type, serverUrl);
          btn.textContent = '⚡ 4K Suave';
          playCloudVideo(streamUrl, name, {
            sizeFormatted: t.totalSize,
            service: 'torbox',
            forceDownscale: true,
          });
        } catch (err) {
          btn.textContent = '⚡ 4K Suave';
          toast('Falha ao obter stream: ' + err.message);
        }
      });
    });

    card.querySelectorAll('.btn-dl-torbox').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const row = btn.closest('.cloud-file-row');
        const fileId = row.dataset.fileId;
        const torrentId = row.dataset.torrentId;
        const name = row.dataset.name;
        const type = row.dataset.type || 'torrent';
        btn.textContent = '...';
        try {
          const streamUrl = await requestTorboxStreamUrl(torrentId, fileId, apiKey, type, serverUrl);
          await sendDownloadToPc(streamUrl, name, serverUrl);
          btn.textContent = '✓ Baixando';
          toast(`Download iniciado no PC: ${name}`);
        } catch (err) {
          btn.textContent = '↓ PC';
          toast(`Falha no download: ${err.message}`);
        }
      });
    });

    container.appendChild(card);
  }

  container.hidden = false;
}

function renderCloudHistory() {
  const container = els.cloudHistoryList;
  if (!container) return;
  const history = getCloudHistory();

  if (history.length === 0) {
    container.innerHTML = '';
    if (els.cloudHistoryEmpty) els.cloudHistoryEmpty.hidden = false;
    return;
  }
  if (els.cloudHistoryEmpty) els.cloudHistoryEmpty.hidden = true;

  container.innerHTML = '';
  const serverUrl = getCurrentServerUrl();

  for (const item of history) {
    const card = document.createElement('div');
    card.className = 'video-card';

    const hint = item.formatHint || detectFromName(item.name);
    let iconLabel = 'VR';
    let iconColor = '#0a84ff';
    if (hint.projection === '360') { iconLabel = '360°'; iconColor = '#0a84ff'; }
    else if (hint.projection === '180') { iconLabel = 'VR180'; iconColor = '#5e5ce6'; }
    else if (hint.projection === 'fisheye') { iconLabel = 'Fisheye'; iconColor = '#ff9f0a'; }
    else if (hint.layout === 'sbs') { iconLabel = '3D SBS'; iconColor = '#30d158'; }

    let serviceTagClass = 'tag-gofile';
    let serviceLabel = 'Nuvem';
    if (item.service === 'torbox') { serviceTagClass = 'tag-torbox'; serviceLabel = 'Torbox'; }
    else if (item.service === 'gofile') { serviceTagClass = 'tag-gofile'; serviceLabel = 'Gofile'; }

    card.innerHTML = `
      <div class="video-card-thumb-wrap" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1c1c1e,#2c2c2e);">
        <svg style="width:42px;height:42px;color:rgba(255,255,255,0.4);"><use href="#i-cloud"/></svg>
        <div class="video-card-badges">
          <span class="badge-format" style="background:${iconColor}cc">${iconLabel}</span>
          <span class="cloud-tag ${serviceTagClass}">${serviceLabel}</span>
        </div>
      </div>
      <div class="video-card-info">
        <strong class="video-card-title" title="${item.name}">${item.name}</strong>
        <div class="video-card-meta" style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
          <span>${item.sizeFormatted || 'Online'}</span>
          <div style="display:flex;gap:4px;">
            ${serverUrl ? '<button class="btn-cloud-action btn-hist-4k" style="background:#5856d6;color:#fff;" title="4K Suave com GPU do PC">⚡ 4K</button>' : ''}
            ${serverUrl ? '<button class="btn-cloud-action btn-download-pc btn-hist-dl" title="Baixar na biblioteca do PC">↓ PC</button>' : ''}
            <button class="btn-cloud-action btn-hist-del" style="background:rgba(255,59,48,0.2);color:#ff453a;border:none;" title="Remover do histórico">✕</button>
          </div>
        </div>
      </div>
    `;

    // Click no card abre reprodução
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-cloud-action')) return;
      playCloudVideo(item.url, item.name, {
        sizeFormatted: item.sizeFormatted,
        formatHint: item.formatHint,
        service: item.service,
      });
    });

    // 4K Suave no Histórico
    card.querySelector('.btn-hist-4k')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playCloudVideo(item.url, item.name, {
        sizeFormatted: item.sizeFormatted,
        formatHint: item.formatHint,
        service: item.service,
        forceDownscale: true,
      });
    });

    // Baixar no PC
    card.querySelector('.btn-hist-dl')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        toast(`Enviando download para o PC...`);
        await sendDownloadToPc(item.streamUrl || item.url, item.name, serverUrl);
        toast(`Download em andamento no PC!`);
      } catch (err) {
        toast(`Erro ao baixar: ${err.message}`);
      }
    });

    // Remover do histórico
    card.querySelector('.btn-hist-del')?.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromCloudHistory(item.id);
      renderCloudHistory();
    });

    container.appendChild(card);
  }
}

function setupCloudUI() {
  // Troca de abas da nuvem
  els.tabCloudLink?.addEventListener('click', () => switchCloudTab('link'));
  els.tabCloudTorbox?.addEventListener('click', () => switchCloudTab('torbox'));
  els.tabCloudHistory?.addEventListener('click', () => switchCloudTab('history'));

  // Ação de assistir link colado
  els.btnCloudPlay?.addEventListener('click', () => handleCloudLinkPlay());
  els.btnCloudPlay4k?.addEventListener('click', () => handleCloudLinkPlay({ forceDownscale: true }));
  els.cloudUrlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCloudLinkPlay();
  });

  // Salvar chave do Torbox
  els.btnTorboxSaveKey?.addEventListener('click', async () => {
    const key = (els.torboxKeyInput?.value || '').trim();
    const serverUrl = getCurrentServerUrl();
    await setTorboxApiKey(key, true, serverUrl);
    toast(key ? 'Chave do Torbox salva!' : 'Chave do Torbox removida.');
    if (key) loadTorboxTorrents();
  });

  els.btnTorboxRefresh?.addEventListener('click', () => loadTorboxTorrents());

  // Limpar histórico
  els.btnClearCloudHistory?.addEventListener('click', () => {
    clearCloudHistory();
    renderCloudHistory();
    toast('Histórico da nuvem limpo.');
  });

  // Carrega chave salva
  const savedKey = getTorboxApiKey();
  if (savedKey && els.torboxKeyInput) {
    els.torboxKeyInput.value = savedKey;
  }

  // Renderiza histórico inicial
  renderCloudHistory();
}

// ---------------- Desktop / Electron & Atalhos ----------------
function setupDesktop() {
  if (isElectron) {
    if (els.openFileBtn) {
      els.openFileBtn.removeAttribute('for');
      els.openFileBtn.textContent = 'Abrir vídeo do computador';
      els.openFileBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const file = await window.electronAPI.openFileDialog();
        if (file) {
          openVideoSource({
            url: file.url,
            name: file.name,
            size: file.size,
            isBlob: false,
            originalPath: file.path,
          });
        }
      });
    }

    const sub = els.home?.querySelector('.subtitle');
    if (sub) sub.textContent = 'Player de vídeos imersivos em 360°, VR180 e 3D no Windows.';

    const foot = els.home?.querySelector('.footnote');
    if (foot) foot.textContent = 'Clique para abrir ou arraste arquivos de vídeo (.mp4, .mkv, .webm, .mov, .avi, etc.) para dentro da janela.';

    if (els.pcServerTitle) els.pcServerTitle.textContent = 'Pastas e Vídeos do Computador';
    if (els.pcServerBadge) els.pcServerBadge.textContent = 'Local';
    if (els.pcServerConnectWrap) els.pcServerConnectWrap.hidden = true;
    if (els.pcServerMsg) els.pcServerMsg.textContent = 'Vídeos detectados automaticamente nas suas pastas locais. Clique em qualquer card para assistir.';

    loadElectronLibrary();

    els.btnAddFolder?.addEventListener('click', async () => {
      if (window.electronAPI.addLibraryFolder) {
        const res = await window.electronAPI.addLibraryFolder();
        if (res) {
          renderElectronLibrary(res);
          toast(`Pasta adicionada! ${res.videos.length} vídeo(s) encontrado(s).`);
        }
      }
    });

    els.btnRescanFolders?.addEventListener('click', async () => {
      if (window.electronAPI.rescanLibrary) {
        toast('Atualizando biblioteca local...');
        const res = await window.electronAPI.rescanLibrary();
        if (res) {
          renderElectronLibrary(res);
          toast(`Biblioteca atualizada! ${res.videos.length} vídeo(s) no total.`);
        }
      }
    });

    window.electronAPI.onOpenFile((file) => {
      if (file) {
        openVideoSource({
          url: file.url,
          name: file.name,
          size: file.size || 0,
          isBlob: false,
          originalPath: file.path,
        });
      }
    });
  } else {
    // Modo Web: Botão de adicionar pasta via prompt para o servidor local
    els.btnAddFolder?.addEventListener('click', async () => {
      const serverUrl = getCurrentServerUrl();
      if (!serverUrl) {
        toast('Conecte-se ao servidor do computador primeiro.');
        return;
      }
      const folderPath = prompt('Digite o caminho absoluto da pasta no PC (ex: E:\\MeusVR ou D:\\Videos):');
      if (folderPath && folderPath.trim()) {
        try {
          const res = await fetch(`${serverUrl}/api/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: folderPath.trim() }),
          });
          if (res.ok) {
            toast('Pasta adicionada! Atualizando...');
            connectServer(serverUrl, true);
          } else {
            toast('Não foi possível adicionar a pasta.');
          }
        } catch {
          toast('Erro ao comunicar com o servidor.');
        }
      }
    });

    els.btnRescanFolders?.addEventListener('click', () => {
      const serverUrl = getCurrentServerUrl();
      if (serverUrl) {
        toast('Atualizando vídeos do servidor...');
        connectServer(serverUrl, false);
      } else {
        discoverAndConnectServer(false);
      }
    });
  }

  // Zoom no FOV via scroll do mouse
  $('stage')?.addEventListener('wheel', (e) => {
    if (state.headset) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 3 : -3;
    if (vr) {
      vr.viewFov = clamp(vr.viewFov + delta, 30, 110);
      state.desktopView.fov = vr.viewFov;
      const fovSlider = $('sl-view-fov');
      if (fovSlider) {
        fovSlider.value = vr.viewFov;
        const valEl = $('sl-view-fov-val');
        if (valEl) valEl.textContent = Math.round(vr.viewFov) + '°';
        setRangeFill(fovSlider);
      }
      saveSettings();
    }
  }, { passive: false });

  // Arrastar e soltar arquivos (Drag & Drop)
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (isElectron && window.electronAPI.getPathForFile) {
      const fullPath = window.electronAPI.getPathForFile(file);
      if (fullPath) {
        const info = await window.electronAPI.getFileInfo(fullPath);
        if (info) {
          openVideoSource({
            url: info.url,
            name: info.name,
            size: info.size,
            isBlob: false,
            originalPath: info.path,
          });
          return;
        }
      }
    }
    openFile(file);
  });

  // Atalhos de teclado no Desktop e mini controles VR em modo Teclado/Mídia
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'MediaPlayPause') {
      e.preventDefault();
      togglePlay();
      hud(video.paused ? 'Pausado' : 'Reproduzindo');
    } else if (e.code === 'ArrowLeft' || e.key === 'MediaTrackPrevious' || e.code === 'KeyJ') {
      e.preventDefault();
      seekBy(-10);
    } else if (e.code === 'ArrowRight' || e.key === 'MediaTrackNext' || e.code === 'KeyL') {
      e.preventDefault();
      seekBy(10);
    } else if (e.code === 'KeyR' || e.code === 'KeyC') {
      e.preventDefault();
      requestGyroOnce();
      look?.recenter();
      hud('Visão centralizada');
    } else if (e.code === 'KeyV' || e.code === 'KeyH') {
      e.preventDefault();
      setHeadset(!state.headset);
      hud(state.headset ? 'Modo Óculos' : 'Modo Tela');
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      video.volume = clamp(video.volume + 0.05, 0, 1);
      hud(`Volume ${Math.round(video.volume * 100)}%`);
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      video.volume = clamp(video.volume - 0.05, 0, 1);
      hud(`Volume ${Math.round(video.volume * 100)}%`);
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      video.muted = !video.muted;
      els.btnMute.querySelector('use').setAttribute('href', video.muted ? '#i-muted' : '#i-speaker');
      hud(video.muted ? 'Mudo' : `Volume ${Math.round(video.volume * 100)}%`);
    } else if (e.code === 'KeyF' || e.code === 'F11') {
      e.preventDefault();
      if (isElectron) {
        window.electronAPI.toggleFullScreen();
      } else {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    } else if (e.code === 'KeyO' || e.code === 'KeyS') {
      e.preventDefault();
      settingsPill.toggle();
    } else if (e.code === 'KeyD') {
      e.preventDefault();
      toggleTelemetry();
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      if (sheetOpen()) {
        closeSheets();
      } else if (!els.player.hidden) {
        closePlayer();
      }
    }
  });
}

// ---------------- Inicialização ----------------
(function init() {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone) $('install-tip').hidden = false;

  syncSliders();
  renderFormatUI();
  renderEnvironmentUI();
  setupDesktop();
  initGamepad();
  setupCloudUI();
  if (state.headset) {
    setHeadset(true);
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Configuração do Servidor no PC com auto-descoberta mDNS silenciosa
  if (isElectron) {
    loadElectronLibrary();
  } else {
    const savedServer = store.get('server_url');
    if (savedServer) {
      els.serverUrlInput.value = savedServer;
      connectServer(savedServer, true);
    } else if (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io')) {
      const currentOrigin = location.origin;
      els.serverUrlInput.value = currentOrigin;
      connectServer(currentOrigin, true);
    } else {
      discoverAndConnectServer(true);
    }
  }

  // ?src=URL ou ?cloud=URL abre um vídeo por endereço direto
  const src = new URLSearchParams(location.search).get('src') || new URLSearchParams(location.search).get('cloud');
  if (src) {
    const name = decodeURIComponent(src.split('/').pop().split('?')[0]);
    openVideoSource({
      url: src,
      name,
      size: 0,
      isBlob: false,
    });
  }
})();
