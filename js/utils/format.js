// Utilitários de Formatação e Operações Matemáticas Básicas
// Fonte única da verdade (Single Source of Truth) para Frontend (PWA/Web) e Backend (Node.js)

/**
 * Converte bytes em representação textual legível (B, KB, MB, GB)
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Formata segundos no formato HH:MM:SS ou MM:SS
 * @param {number} s
 * @returns {string}
 */
export function formatDuration(s) {
  if (!s || !isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export const fmtTime = formatDuration;
export const formatTime = formatDuration;

/**
 * Delimita um valor numérico entre limites mínimo e máximo
 * @param {number} v
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
