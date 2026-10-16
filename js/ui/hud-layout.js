// Modelo puro (sem DOM) do layout dos HUDs flutuantes.
// Cada modo (óculos / tela) tem um perfil independente com posição, escala,
// margem segura, opacidade, tempo de auto-ocultar e opção de seguir o centro óptico.

export const HUD_ELEMENTS = [
  { id: 'top', label: 'Barra de funções' },
  { id: 'bottom', label: 'Controles do vídeo' },
  { id: 'pill', label: 'Pílula de ajustes' },
  { id: 'hud', label: 'Mensagens' },
];

export const AUTO_HIDE_OPTIONS = [2000, 3500, 5000, 8000, 0]; // 0 = nunca ocultar

export const LIMITS = {
  pos: 40, // deslocamento máximo em % do painel do olho (ou tela)
  scaleMin: 0.6,
  scaleMax: 1.4,
  scaleStep: 0.05,
  safeMax: 20, // margem segura máxima em %
  safeStep: 1,
  opacityMin: 0.4,
  opacityStep: 0.1,
};

export const DEFAULT_HEADSET_SAFE_MARGIN = 8;

const MODES = ['headset', 'screen'];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const round = (v, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

function normalizeMode(mode) {
  return MODES.includes(mode) ? mode : 'screen';
}

export function defaultLayout(mode) {
  const m = normalizeMode(mode);
  return {
    version: 1,
    safeMargin: m === 'headset' ? DEFAULT_HEADSET_SAFE_MARGIN : 0,
    opacity: 1,
    autoHideMs: 3500,
    followLens: false,
    elements: Object.fromEntries(HUD_ELEMENTS.map((e) => [e.id, { x: 0, y: 0, scale: 1 }])),
  };
}

function normalizeElement(raw, fallback) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    x: round(clamp(num(src.x, fallback.x), -LIMITS.pos, LIMITS.pos), 2),
    y: round(clamp(num(src.y, fallback.y), -LIMITS.pos, LIMITS.pos), 2),
    scale: round(clamp(num(src.scale, fallback.scale), LIMITS.scaleMin, LIMITS.scaleMax), 3),
  };
}

export function normalizeLayout(raw, mode) {
  const def = defaultLayout(mode);
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const srcElements = src.elements && typeof src.elements === 'object' ? src.elements : {};

  const autoHide = num(src.autoHideMs, def.autoHideMs);

  return {
    version: 1,
    safeMargin: round(clamp(num(src.safeMargin, def.safeMargin), 0, LIMITS.safeMax), 2),
    opacity: round(clamp(num(src.opacity, def.opacity), LIMITS.opacityMin, 1), 2),
    autoHideMs: AUTO_HIDE_OPTIONS.includes(autoHide) ? autoHide : def.autoHideMs,
    followLens: typeof src.followLens === 'boolean' ? src.followLens : def.followLens,
    elements: Object.fromEntries(
      HUD_ELEMENTS.map((e) => [e.id, normalizeElement(srcElements[e.id], def.elements[e.id])]),
    ),
  };
}

function withElement(layout, id, patch) {
  if (!layout.elements[id]) return layout;
  const next = {
    ...layout,
    elements: { ...layout.elements, [id]: { ...layout.elements[id], ...patch } },
  };
  return next;
}

export function moveElement(layout, id, dx, dy) {
  const el = layout.elements[id];
  if (!el) return layout;
  return withElement(layout, id, {
    x: round(clamp(el.x + (dx || 0), -LIMITS.pos, LIMITS.pos), 2),
    y: round(clamp(el.y + (dy || 0), -LIMITS.pos, LIMITS.pos), 2),
  });
}

export function scaleElement(layout, id, dir) {
  const el = layout.elements[id];
  if (!el) return layout;
  const scale = round(clamp(el.scale + Math.sign(dir || 0) * LIMITS.scaleStep, LIMITS.scaleMin, LIMITS.scaleMax), 3);
  return withElement(layout, id, { scale });
}

export function resetElement(layout, id, mode) {
  const def = defaultLayout(mode);
  if (!def.elements[id]) return layout;
  return withElement(layout, id, { ...def.elements[id] });
}

export function adjustSafeMargin(layout, dir) {
  return {
    ...layout,
    safeMargin: round(clamp(layout.safeMargin + Math.sign(dir || 0) * LIMITS.safeStep, 0, LIMITS.safeMax), 2),
  };
}

export function adjustOpacity(layout, dir) {
  return {
    ...layout,
    opacity: round(clamp(layout.opacity + Math.sign(dir || 0) * LIMITS.opacityStep, LIMITS.opacityMin, 1), 2),
  };
}

export function cycleAutoHide(layout, dir = 1) {
  const idx = AUTO_HIDE_OPTIONS.indexOf(layout.autoHideMs);
  const n = AUTO_HIDE_OPTIONS.length;
  const next = AUTO_HIDE_OPTIONS[(((idx < 0 ? 1 : idx) + Math.sign(dir || 1)) % n + n) % n];
  return { ...layout, autoHideMs: next };
}

export function formatAutoHide(ms) {
  if (!ms) return 'Nunca';
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1).replace('.', ',')} s`;
}

// Converte o centro óptico do shader de distorção (projections.js) em offset do HUD (% do painel).
// Shader: centerL = (0.5 - ipd + lensLX, 0.5 + lensLY); UV.y cresce para cima, CSS y cresce para baixo.
export function lensOffsets(hs = {}) {
  const s = hs || {};
  const ipd = num(s.ipd, 0);
  const z = (v) => (Object.is(v, -0) ? 0 : v);
  return {
    l: { x: z(round((-ipd + num(s.lensLX, 0)) * 100, 3)), y: z(round(-num(s.lensLY, 0) * 100, 3)) },
    r: { x: z(round((ipd + num(s.lensRX, 0)) * 100, 3)), y: z(round(-num(s.lensRY, 0) * 100, 3)) },
  };
}

export function layoutToCssVars(layout, { headset = false, lens = null } = {}) {
  const vars = {
    '--hud-pane-w': headset ? '50vw' : '100vw',
    '--hud-safe': String(layout.safeMargin),
    '--hud-opacity': String(layout.opacity),
  };
  HUD_ELEMENTS.forEach(({ id }) => {
    const el = layout.elements[id];
    vars[`--hud-${id}-x`] = String(el.x);
    vars[`--hud-${id}-y`] = String(el.y);
    vars[`--hud-${id}-s`] = String(el.scale);
  });
  const useLens = headset && layout.followLens && lens;
  const off = useLens ? lens : { l: { x: 0, y: 0 }, r: { x: 0, y: 0 } };
  vars['--hud-lens-l-x'] = String(off.l.x);
  vars['--hud-lens-l-y'] = String(off.l.y);
  vars['--hud-lens-r-x'] = String(off.r.x);
  vars['--hud-lens-r-y'] = String(off.r.y);
  return vars;
}
