import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { getBinaryPath } from './bin-paths.js';

// Cache em memória para evitar chamadas redundantes do ffprobe
const audioProbeCache = new Map();

/**
 * Limpa o cache em memória (útil para testes unitários ou recarregamento de arquivos)
 */
export function clearAudioProbeCache() {
  audioProbeCache.clear();
}

/**
 * Função pura para analisar e classificar os metadados de uma stream de áudio.
 * @param {object} stream - Objeto retornado pelo ffprobe para a stream de áudio
 * @param {string} [filePath] - Caminho opcional do arquivo para heurística de fallback no nome
 * @returns {object} Metadados estruturados do áudio espacial
 */
export function parseAudioSpatialInfo(stream, filePath = '') {
  if (!stream) {
    return { spatialType: 'none', channels: 0 };
  }

  const channels = typeof stream.channels === 'number' ? stream.channels : 2;
  const layout = (stream.channel_layout || '').toLowerCase();
  const tags = stream.tags || {};
  const sideData = stream.side_data_list || [];
  const codec = stream.codec_name || null;
  const sampleRate = stream.sample_rate ? parseInt(stream.sample_rate, 10) : null;

  // 1. Verifica se possui metadado explícito de Ambisonics (FOA - 4 canais)
  const isAmbisonic =
    layout.includes('ambisonic') ||
    layout.includes('quad') ||
    sideData.some((sd) => sd?.side_data_type?.toLowerCase().includes('spherical')) ||
    (channels === 4 && (
      (tags.handler_name && tags.handler_name.toLowerCase().includes('ambisonic')) ||
      (filePath && filePath.toLowerCase().includes('ambi'))
    ));

  if (isAmbisonic && channels === 4) {
    return {
      spatialType: 'ambisonics-foa',
      channels: 4,
      codec,
      layout: stream.channel_layout || '4.0(ambisonic)',
      sampleRate,
    };
  }

  // 2. Verifica Surround Multicanal (5.1 ou 7.1)
  if (channels >= 6) {
    const spatialType = channels >= 8 ? 'surround-7.1' : 'surround-5.1';
    return {
      spatialType,
      channels,
      codec,
      layout: stream.channel_layout || (channels >= 8 ? '7.1' : '5.1'),
      sampleRate,
    };
  }

  // 3. Estéreo padrão (elegível para ancoragem espacial virtual em VR 180 / Modo Cinema com head-tracking)
  if (channels === 2) {
    return {
      spatialType: 'stereo-headtracked',
      channels: 2,
      codec,
      layout: stream.channel_layout || 'stereo',
      sampleRate,
    };
  }

  // 4. Mono ou configurações não espaciais
  return {
    spatialType: 'none',
    channels,
    codec,
    layout: stream.channel_layout || (channels === 1 ? 'mono' : `${channels} channels`),
    sampleRate,
  };
}

/**
 * Inspeciona os metadados de áudio de um arquivo usando ffprobe com cache em memória.
 * @param {string} filePath - Caminho absoluto ou relativo do arquivo de mídia
 * @param {string} [customFfprobePath] - Caminho customizado para o executável ffprobe (opcional)
 * @returns {Promise<object>} Metadados do áudio espacial
 */
export function probeAudioMetadata(filePath, customFfprobePath) {
  return new Promise((resolve) => {
    if (!filePath) {
      return resolve({ spatialType: 'none', channels: 0, error: 'Caminho do arquivo não fornecido' });
    }

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return resolve({ spatialType: 'none', channels: 0, error: 'Arquivo não encontrado' });
    }

    const cacheKey = `${filePath}:${stat.size}:${stat.mtimeMs}`;
    if (audioProbeCache.has(cacheKey)) {
      return resolve(audioProbeCache.get(cacheKey));
    }

    const ffprobePath = customFfprobePath || getBinaryPath('ffprobe');
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'a:0',
      filePath,
    ];

    execFile(ffprobePath, args, { timeout: 8000 }, (err, stdout) => {
      if (err || !stdout) {
        const fallback = { spatialType: 'none', channels: 0, error: err ? err.message : 'Sem stream de áudio' };
        return resolve(fallback);
      }

      try {
        const data = JSON.parse(stdout);
        const stream = data.streams?.[0];
        if (!stream) {
          const noAudio = { spatialType: 'none', channels: 0 };
          audioProbeCache.set(cacheKey, noAudio);
          return resolve(noAudio);
        }

        const result = parseAudioSpatialInfo(stream, filePath);
        audioProbeCache.set(cacheKey, result);
        resolve(result);
      } catch (parseErr) {
        resolve({ spatialType: 'none', channels: 2, error: parseErr.message });
      }
    });
  });
}
