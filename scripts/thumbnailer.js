// Gerador e gerenciador de miniaturas (posters) para vídeos VR
// Utiliza FFmpeg com binários locais embutidos e cache em .cache/thumbnails/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { getBinaryPath, setupBinaryEnv } from './bin-paths.js';

setupBinaryEnv();

const THUMB_CACHE_DIR = path.resolve('.cache', 'thumbnails');

// Garante que o diretório de cache exista
try {
  if (!fs.existsSync(THUMB_CACHE_DIR)) {
    fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.error('[Thumbnailer] Erro ao criar pasta de cache:', e.message);
}

// Mapa para coordenar requisições concorrentes da mesma miniatura
const pendingGenerations = new Map();

/**
 * Retorna o caminho absoluto do arquivo de miniatura (gerando sob demanda se necessário).
 * @param {string} fullVideoPath Caminho completo do arquivo de vídeo original
 * @param {string} relPath Caminho relativo para exibição e hash
 * @param {number} duration Duração do vídeo em segundos (se conhecida)
 * @returns {Promise<string|null>} Caminho absoluto da imagem JPG ou null em caso de erro
 */
export async function getThumbnailPath(fullVideoPath, relPath, duration = 0) {
  if (!fs.existsSync(fullVideoPath)) return null;

  let stat;
  try {
    stat = fs.statSync(fullVideoPath);
  } catch {
    return null;
  }

  const hashKey = `${relPath}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
  const hash = crypto.createHash('md5').update(hashKey).digest('hex');
  const thumbFileName = `thumb_${hash}.jpg`;
  const thumbFilePath = path.join(THUMB_CACHE_DIR, thumbFileName);

  // Se já existir no cache do disco, retorna imediatamente
  if (fs.existsSync(thumbFilePath)) {
    return thumbFilePath;
  }

  // Se já houver um processo do FFmpeg gerando esta mesma miniatura, aguarda o resultado existente
  if (pendingGenerations.has(hash)) {
    return pendingGenerations.get(hash);
  }

  const promise = (async () => {
    const tempFile = path.join(THUMB_CACHE_DIR, `temp_${hash}_${Date.now()}.jpg`);
    const seekSec = Math.min(Math.max((duration || 0) * 0.1, 5), 120);

    const ffmpegBin = getBinaryPath('ffmpeg');
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', seekSec.toFixed(2),
      '-i', fullVideoPath,
      '-vframes', '1',
      '-vf', 'scale=480:-1',
      '-q:v', '3',
      '-y',
      tempFile,
    ];

    try {
      await new Promise((resolve, reject) => {
        const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(tempFile)) {
            try {
              fs.renameSync(tempFile, thumbFilePath);
              resolve();
            } catch (renameErr) {
              reject(renameErr);
            }
          } else {
            // Fallback: tentar extrair do início (0s) se a duração exceder o índice
            const fallbackArgs = [
              '-hide_banner',
              '-loglevel', 'error',
              '-ss', '1.0',
              '-i', fullVideoPath,
              '-vframes', '1',
              '-vf', 'scale=480:-1',
              '-q:v', '3',
              '-y',
              tempFile,
            ];
            const p2 = spawn(ffmpegBin, fallbackArgs);
            p2.on('close', (c2) => {
              if (c2 === 0 && fs.existsSync(tempFile)) {
                try {
                  fs.renameSync(tempFile, thumbFilePath);
                  resolve();
                } catch (rErr) {
                  reject(rErr);
                }
              } else {
                reject(new Error(stderr || `FFmpeg saiu com código ${code}`));
              }
            });
            p2.on('error', reject);
          }
        });
        proc.on('error', reject);
      });

      return thumbFilePath;
    } catch (err) {
      console.warn(`[Thumbnailer] Falha ao extrair miniatura de "${relPath}":`, err.message);
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}
      return null;
    } finally {
      pendingGenerations.delete(hash);
    }
  })();

  pendingGenerations.set(hash, promise);
  return promise;
}
