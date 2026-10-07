// Detecção automática do formato: nome do arquivo → conteúdo da imagem → proporção.

const near = (a, b, tol = 0.08) => Math.abs(a - b) / b < tol;

/** Procura pistas no nome do arquivo (ex.: _180_sbs, _360_tb, fisheye, _LR). */
export function detectFromName(name) {
  const n = name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  const t = '_' + n.replace(/[^a-z0-9]+/g, '_') + '_';
  const res = {};

  if (/fisheye|_fe_|_fish|_fe180|_mkx|_rf52/.test(t)) res.projection = 'fisheye';
  else if (/(^|[^0-9])180([^0-9]|$)/.test(n) || /vr180/.test(t)) res.projection = '180';
  else if (/(^|[^0-9])360([^0-9]|$)/.test(n)) res.projection = '360';

  if (/_sbs|sbs_|_lr_|_lr180|_rl_|left_?right|_3dh_|side_?by_?side|_hsbs|_fsbs|_half_?sbs/.test(t)) res.layout = 'sbs';
  else if (/_tb_|_ou_|_tab_|_3dv_|over_?under|top_?bottom|_htb|_ftb|_hou|_fou|_tb360|_360tb/.test(t)) res.layout = 'tb';
  else if (/_mono_|_2d_/.test(t)) res.layout = 'mono';

  if (!res.projection && /_3d_/.test(t) && !res.layout) res.layout = 'sbs';
  return res;
}

/**
 * Analisa um quadro do vídeo: compara metades (estéreo lado a lado ou em cima/embaixo)
 * e verifica cantos escuros (círculos de olho de peixe).
 */
export function analyzeFrame(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const w = 128;
  const h = Math.max(16, Math.round((w * vh) / vw / 2) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const L = new Float32Array(w * h);
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < w * h; i++) {
    const l = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    L[i] = l;
    sum += l;
    sum2 += l * l;
  }
  const mean = sum / (w * h);
  const std = Math.sqrt(Math.max(0, sum2 / (w * h) - mean * mean));

  const at = (x, y) => L[y * w + x];
  const regionMean = (x0, y0, rw, rh) => {
    let s = 0;
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) s += at(x, y);
    return s / (rw * rh);
  };
  const diff = (ax, ay, bx, by, rw, rh) => {
    let s = 0;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) s += Math.abs(at(ax + x, ay + y) - at(bx + x, by + y));
    return s / (rw * rh);
  };

  const hw = w / 2;
  const hh = h / 2;
  const diffLR = diff(0, 0, hw, 0, hw, h);
  const diffTB = diff(0, 0, 0, hh, w, hh);

  const cs = Math.max(2, Math.round(hw * 0.08));
  const corners = [
    [0, 0], [hw - cs, 0], [0, h - cs], [hw - cs, h - cs],
    [hw, 0], [w - cs, 0], [hw, h - cs], [w - cs, h - cs],
  ].map(([x, y]) => regionMean(x, y, cs, cs));
  const cornerMax = Math.max(...corners);
  const centerL = regionMean(Math.round(hw * 0.35), Math.round(h * 0.35), Math.round(hw * 0.3), Math.round(h * 0.3));

  return {
    valid: mean > 0.03 && std > 0.02,
    mean,
    std,
    diffLR,
    diffTB,
    fisheye: cornerMax < 0.045 && centerL > 0.08,
  };
}

/**
 * Combina as pistas e devolve { projection, layout, source }.
 * source: 'nome' | 'imagem' | 'proporção'
 */
export function guessFormat(name, vw, vh, analysis) {
  const hint = detectFromName(name || '');
  const r = vw && vh ? vw / vh : 2;
  const a = analysis && analysis.valid ? analysis : null;
  let { projection, layout } = hint;
  let usedImage = false;

  const stereoTol = a ? Math.max(0.035, a.std * 0.35) : 0;
  const stereoLR = !!a && a.diffLR < stereoTol && a.diffLR < a.diffTB * 0.7;
  const stereoTB = !!a && a.diffTB < stereoTol && a.diffTB < a.diffLR * 0.7;

  if (!projection && a?.fisheye && near(r, 2, 0.12)) {
    projection = 'fisheye';
    usedImage = true;
  }

  if (!layout) {
    if (projection === 'fisheye') layout = near(r, 1, 0.15) ? 'mono' : 'sbs';
    else if (stereoLR) { layout = 'sbs'; usedImage = true; }
    else if (stereoTB) { layout = 'tb'; usedImage = true; }
    else if (near(r, 1, 0.12)) layout = projection === '180' ? 'mono' : 'tb';
    else if (near(r, 4) || near(r, 32 / 9)) layout = 'sbs';
    else if (projection === '180' && near(r, 2)) layout = 'sbs';
    else layout = 'mono';
  }

  if (!projection) {
    const flatRatio = (r > 1.2 && r < 1.9) || near(r, 32 / 9) || near(r, 8 / 9);
    if (flatRatio) projection = 'flat';
    else if (layout === 'sbs' && near(r, 2, 0.1)) projection = '180';
    else if (layout === 'sbs' && near(r, 4)) projection = '360';
    else if (layout === 'tb' && near(r, 1, 0.12)) projection = '360';
    else if (layout === 'mono' && near(r, 1, 0.12)) projection = '180';
    else if (r >= 1.9) projection = '360';
    else projection = 'flat';
  }

  const source = hint.projection || hint.layout ? 'nome' : usedImage ? 'imagem' : 'proporção';
  return { projection, layout, source };
}
