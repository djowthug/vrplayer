// Módulo de Transcodificação Dinâmica e Streaming HLS em Tempo Real
// Detecta aceleração por GPU (NVENC/QSV), aplica downscale 8K -> 4K (3840px)
// e gerencia sessões e arquivos efêmeros sob demanda para o VR Player.

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn, execFile } from 'child_process';
import { getBinaryPath, setupBinaryEnv } from './bin-paths.js';
import { probeAudioMetadata } from './audio-probe.js';

// Injeta binários embutidos no PATH de execução
setupBinaryEnv();

const HLS_BASE_DIR = path.join(os.tmpdir(), 'vrplayer-hls-cache');
const INACTIVITY_TIMEOUT_MS = 60000; // Encerra processo e limpa cache após 60s sem requisições
const probeCache = new Map();
const activeSessions = new Map();

let detectedEncoder = null;

// Garante que o diretório base de cache temporário exista limpo
try {
  if (fs.existsSync(HLS_BASE_DIR)) {
    fs.rmSync(HLS_BASE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(HLS_BASE_DIR, { recursive: true });
} catch (e) {
  console.error('[HLS] Aviso ao inicializar pasta temporária:', e.message);
}

/**
 * Detecta se a GPU suporta codificação por hardware (NVENC para NVIDIA ou QSV para Intel)
 * com fallback para CPU (libx264).
 */
export async function detectHardwareEncoder() {
  if (detectedEncoder) return detectedEncoder;

  const forced = (process.env.HARDWARE_ENCODER || '').trim().toLowerCase();
  if (forced === 'nvenc') {
    detectedEncoder = {
      id: 'h264_nvenc',
      label: 'NVIDIA NVENC (Forçado via HARDWARE_ENCODER)',
      isHardware: true,
      vendor: 'NVIDIA'
    };
    return detectedEncoder;
  }
  if (forced === 'qsv') {
    detectedEncoder = {
      id: 'h264_qsv',
      label: 'Intel Quick Sync (Forçado via HARDWARE_ENCODER)',
      isHardware: true,
      vendor: 'Intel'
    };
    return detectedEncoder;
  }
  if (forced === 'cpu' || forced === 'libx264') {
    detectedEncoder = {
      id: 'libx264',
      label: 'CPU (libx264 - Forçado via HARDWARE_ENCODER)',
      isHardware: false,
      vendor: 'CPU'
    };
    return detectedEncoder;
  }

  // 1. Tenta NVIDIA NVENC (h264_nvenc)
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(getBinaryPath('ffmpeg'), [
        '-f', 'lavfi', '-i', 'testsrc=duration=1:size=256x256',
        '-c:v', 'h264_nvenc', '-pix_fmt', 'yuv420p',
        '-f', 'null', '-'
      ]);
      p.on('close', (code) => (code === 0 ? resolve() : reject()));
      p.on('error', reject);
    });
    detectedEncoder = {
      id: 'h264_nvenc',
      label: 'NVIDIA NVENC (Aceleração por GPU)',
      isHardware: true,
      vendor: 'NVIDIA'
    };
    return detectedEncoder;
  } catch {}

  // 2. Tenta Intel QuickSync (h264_qsv)
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(getBinaryPath('ffmpeg'), [
        '-f', 'lavfi', '-i', 'testsrc=duration=1:size=256x256',
        '-c:v', 'h264_qsv',
        '-f', 'null', '-'
      ]);
      p.on('close', (code) => (code === 0 ? resolve() : reject()));
      p.on('error', reject);
    });
    detectedEncoder = {
      id: 'h264_qsv',
      label: 'Intel Quick Sync (QSV)',
      isHardware: true,
      vendor: 'Intel'
    };
    return detectedEncoder;
  } catch {}

  // 3. Fallback CPU libx264
  detectedEncoder = {
    id: 'libx264',
    label: 'CPU (libx264 ultrafast)',
    isHardware: false,
    vendor: 'CPU'
  };
  return detectedEncoder;
}

/**
 * Analisa o arquivo com ffprobe e armazena em cache para desempenho instantâneo.
 */
export function probeMedia(filePath) {
  return new Promise((resolve) => {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return resolve({ error: 'Arquivo não encontrado', canProbe: false });
    }

    const cacheKey = `${filePath}:${stat.size}:${stat.mtimeMs}`;
    if (probeCache.has(cacheKey)) {
      return resolve(probeCache.get(cacheKey));
    }

    execFile(getBinaryPath('ffprobe'), [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_name,codec_type,profile,width,height,channels:format=duration',
      '-of', 'json',
      filePath,
    ], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ error: err.message, canProbe: false });
      try {
        const info = JSON.parse(stdout);
        const v = (info.streams || []).find((s) => s.codec_type === 'video');
        const a = (info.streams || []).find((s) => s.codec_type === 'audio');

        const vCodec = v?.codec_name ? v.codec_name.toLowerCase() : null;
        const aCodec = a?.codec_name ? a.codec_name.toLowerCase() : null;
        const width = v?.width || 0;
        const height = v?.height || 0;
        const channels = a?.channels || 2;
        const duration = parseFloat(info.format?.duration || v?.duration || 0) || 0;

        const ext = path.extname(filePath).toLowerCase();
        // Critério Safari Direct:
        // Contêiner MP4/MOV, H.264 ou H.265 (HEVC), áudio AAC/MP3 e resolução <= 4K (largura <= 3840px)
        const isIosContainer = ext === '.mp4' || ext === '.mov' || ext === '.m4v';
        const isIosVideo = vCodec === 'h264' || vCodec === 'hevc';
        const isIosAudio = !aCodec || aCodec === 'aac' || aCodec === 'mp3';
        const is4kOrLess = width > 0 && width <= 3840;

        const isDirectCompatible = isIosContainer && isIosVideo && isIosAudio && is4kOrLess;
        const is8k = width > 3840;

        let reason = 'Compatível direto';
        if (!isDirectCompatible) {
          if (is8k) reason = `Resolução ${width}px > 4K (requer downscale para 3840px)`;
          else if (!isIosContainer) reason = `Contêiner ${ext.toUpperCase()} incompatível com Safari`;
          else if (!isIosVideo) reason = `Codec de vídeo ${vCodec} requer H.264`;
          else if (!isIosAudio) reason = `Áudio ${aCodec} requer conversão AAC`;
        }

        const result = {
          canProbe: true,
          videoCodec: vCodec,
          audioCodec: aCodec,
          width,
          height,
          channels,
          duration,
          isIosContainer,
          isIosVideo,
          isIosAudio,
          is4kOrLess,
          isDirectCompatible,
          is8k,
          needsDownscale: is8k,
          reason,
        };

        probeCache.set(cacheKey, result);
        resolve(result);
      } catch (e) {
        resolve({ error: e.message, canProbe: false });
      }
    });
  });
}

export const activeKillPromises = new Map();

export async function terminateSession(session) {
  if (!session) return;
  const child = session.process;
  session.process = null;

  if (child && !child.killed) {
    child._intentionallyKilled = true;

    const killPromise = new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };

      child.once('close', finish);
      child.once('exit', finish);

      try {
        if (process.platform === 'win32' && child.pid) {
          // Encerra imediatamente toda a árvore de processos do FFmpeg no Windows
          spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        finish();
      }

      // Timeout de segurança de 800ms para evitar travar se o SO demorar
      setTimeout(() => {
        if (!done) {
          try {
            if (process.platform === 'win32' && child.pid) {
              spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
            } else {
              child.kill('SIGKILL');
            }
          } catch {}
          finish();
        }
      }, 800);
    });

    if (session.hash) {
      activeKillPromises.set(session.hash, killPromise);
    }
    await killPromise;
    if (session.hash) {
      activeKillPromises.delete(session.hash);
    }
  }

  const dirToDelete = session.dir;
  if (dirToDelete && fs.existsSync(dirToDelete)) {
    try {
      fs.rmSync(dirToDelete, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Limpa todas as sessões HLS ativas e encerra processos FFmpeg.
 */
export async function cleanupAllHlsSessions() {
  const promises = [];
  for (const [key, session] of activeSessions.entries()) {
    console.log(`[HLS] Encerrando sessão FFmpeg: ${session.name || key}`);
    promises.push(terminateSession(session));
  }
  activeSessions.clear();
  await Promise.all(promises);
  try {
    if (fs.existsSync(HLS_BASE_DIR)) {
      fs.rmSync(HLS_BASE_DIR, { recursive: true, force: true });
    }
  } catch {}
}

// Timer de limpeza periódica por inatividade
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of activeSessions.entries()) {
    if (now - session.lastAccess > INACTIVITY_TIMEOUT_MS) {
      console.log(`[HLS] Sessão para "${session.name}" encerrada por inatividade (${Math.round((now - session.lastAccess) / 1000)}s sem requisições).`);
      terminateSession(session).catch(() => {});
      activeSessions.delete(key);
    }
  }
}, 10000).unref();

async function waitForPlaylist(playlistPath, maxWaitMs = 15000) {
  const start = Date.now();
  const dir = path.dirname(playlistPath);

  while (Date.now() - start < maxWaitMs) {
    if (fs.existsSync(playlistPath)) {
      try {
        const content = fs.readFileSync(playlistPath, 'utf8');
        // Deve conter pelo menos uma tag #EXTINF
        if (content.includes('#EXTINF:')) {
          // Extrai o nome do primeiro arquivo de segmento .ts listado na playlist
          const lines = content.split('\n').map((l) => l.trim());
          const firstSegmentLine = lines.find((l) => l.endsWith('.ts') && !l.startsWith('#'));
          if (firstSegmentLine) {
            const segmentPath = path.resolve(dir, firstSegmentLine);
            if (fs.existsSync(segmentPath)) {
              const stat = fs.statSync(segmentPath);
              // Garante que o segmento foi gravado e possui bytes reais (> 0)
              if (stat.size > 0) {
                return content;
              }
            }
          }
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function waitForSegment(segmentPath, maxWaitMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (fs.existsSync(segmentPath)) {
      const stat = fs.statSync(segmentPath);
      if (stat.size > 0) return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return fs.existsSync(segmentPath);
}

/**
 * Determina os argumentos de codificação de áudio para o FFmpeg no streaming HLS,
 * preservando canais para Ambisonics (FOA - 4 canais) e Surround (5.1 - 6 canais).
 * @param {string} spatialType - 'ambisonics-foa' | 'surround-5.1' | 'surround-7.1' | string
 * @returns {string[]} Argumentos para o FFmpeg
 */
export function getHlsAudioArgs(spatialType) {
  if (spatialType === 'ambisonics-foa') {
    return ['-c:a', 'aac', '-b:a', '384k', '-ac', '4'];
  }
  if (spatialType === 'surround-5.1' || spatialType === 'surround-7.1') {
    return ['-c:a', 'aac', '-b:a', '512k', '-ac', '6'];
  }
  return ['-c:a', 'aac', '-b:a', '256k', '-ac', '2'];
}

/**
 * Cria uma nova sessão FFmpeg para o arquivo, opcionalmente a partir de um timestamp de seek (-ss) e modo espacial.
 */
async function createHlsSession(fullPath, relPath, startTime = 0, seekId = '0', spatialType = null) {
  const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);

  // Aguarda qualquer encerramento pendente do FFmpeg para liberar VRAM da GPU antes do novo spawn
  if (activeKillPromises.has(hash)) {
    try {
      await activeKillPromises.get(hash);
    } catch {}
  }

  const sessionDir = path.join(HLS_BASE_DIR, `${hash}_${seekId}`);
  if (fs.existsSync(sessionDir)) {
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
  }
  fs.mkdirSync(sessionDir, { recursive: true });

  const encoderInfo = await detectHardwareEncoder();
  const probe = await probeMedia(fullPath);

  const playlistPath = path.join(sessionDir, 'master.m3u8');
  const segmentPattern = path.join(sessionDir, `seg_${seekId}_%04d.ts`);

  const args = ['-y'];

  // Fast Input Seek: SEMPRE colocado antes de -i para busca instantânea por keyframe sem decodificar frames prévios
  if (startTime > 0) {
    args.push('-ss', startTime.toFixed(2));
  }

  // -noaccurate_seek e -threads 0 antes de -i para evitar buffer stall e timeout no Safari em vídeos 8K
  args.push('-noaccurate_seek', '-threads', '0', '-i', fullPath);

  // Filtro de escala simples compatível com memória de sistema e WebGL mobile (8K -> 4K)
  args.push('-vf', 'scale=3840:-2,format=yuv420p');

  // Buffer de fila de muxing para evitar overflow em seeks longos (ex.: 2292.5s)
  args.push('-max_muxing_queue_size', '1024');

  // Configurações do encoder de vídeo
  if (encoderInfo.id === 'h264_nvenc') {
    args.push(
      '-c:v', 'h264_nvenc',
      '-preset', 'p2',
      '-tune', 'ull',
      '-rc:v', 'vbr',
      '-cq:v', '22',
      '-b:v', '25M',
      '-maxrate:v', '30M',
      '-bufsize:v', '50M',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0'
    );
  } else if (encoderInfo.id === 'h264_qsv') {
    args.push(
      '-c:v', 'h264_qsv',
      '-preset', 'veryfast',
      '-global_quality', '22',
      '-b:v', '25M',
      '-maxrate:v', '30M',
      '-bufsize:v', '50M',
      '-pix_fmt', 'nv12',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0'
    );
  } else {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-maxrate:v', '25M',
      '-bufsize:v', '50M',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0'
    );
  }

  // Áudio: preserva canais de áudio espacial (Ambisonics FOA ou Surround 5.1/7.1) ou converte para estéreo compatível
  const audioInfo = await probeAudioMetadata(fullPath);
  const effectiveSpatialType = spatialType || audioInfo?.spatialType;
  const audioArgs = getHlsAudioArgs(effectiveSpatialType);
  args.push(...audioArgs);

  // Segmentação HLS: segmentos curtos de 2s com escrita atômica para impedir download incompleto no iOS
  args.push(
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_segment_type', 'mpegts',
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_filename', segmentPattern,
    playlistPath
  );

  console.log(`\n[HLS] ${startTime > 0 ? `[SEEK -> ${startTime.toFixed(1)}s]` : '[INÍCIO]'} Transcodificação em tempo real:`);
  console.log(`   📁 Arquivo: ${path.basename(fullPath)}`);
  console.log(`   ⚡ Encoder: ${encoderInfo.label}`);
  if (startTime > 0) {
    console.log(`   ⏩ Ponto de partida (-ss): ${startTime.toFixed(1)} segundos`);
  }
  console.log(`   📐 Resolução original: ${probe.width}x${probe.height}${probe.is8k ? ' (Downscale ativo -> 3840px)' : ''}`);
  console.log(`   🔊 Áudio HLS: ${audioArgs.join(' ')} (${effectiveSpatialType || 'padrão'})`);

  const child = spawn(getBinaryPath('ffmpeg'), args);

  const lastStderrLines = [];
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      lastStderrLines.push(line);
      if (lastStderrLines.length > 25) {
        lastStderrLines.shift();
      }
    }
  });

  child.on('close', (code) => {
    if (child._intentionallyKilled) return;
    if (code !== 0 && code !== null) {
      console.warn(`[HLS] Processo FFmpeg finalizou com código ${code}`);
      if (lastStderrLines.length > 0) {
        console.error('[HLS FFmpeg Erro]:', lastStderrLines.slice(-10).join('\n'));
      }
    }
  });

  child.on('error', (err) => {
    if (child._intentionallyKilled) return;
    console.error(`[HLS] Erro no processo FFmpeg:`, err.message);
  });

  const session = {
    hash,
    seekId,
    startTime,
    name: path.basename(fullPath),
    relPath,
    fullPath,
    dir: sessionDir,
    playlistPath,
    process: child,
    lastAccess: Date.now(),
    encoder: encoderInfo,
    probe,
    audioInfo,
    spatialType: effectiveSpatialType,
  };

  activeSessions.set(hash, session);
  return session;
}

/**
 * Cria ou recupera uma sessão de transcodificação HLS em tempo real para o arquivo.
 */
async function getOrCreateHlsSession(fullPath, relPath, startTime = 0, seekId = null, spatialType = null) {
  const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);
  let session = activeSessions.get(hash);

  if (session && session.process && !session.process.killed) {
    const diff = Math.abs((session.startTime || 0) - startTime);
    const seekIdDiff = seekId && session.seekId !== seekId;
    const spatialDiff = spatialType && session.spatialType !== spatialType;
    if (diff > 1.5 || seekIdDiff || spatialDiff) {
      console.log(`[HLS] Reiniciando sessão ativa para "${session.name}" devido a ${spatialDiff ? 'alteração de perfil de áudio espacial' : 'seek'}`);
      await terminateSession(session);
      activeSessions.delete(hash);
    } else {
      session.lastAccess = Date.now();
      return session;
    }
  }

  // Interrompe outras sessões ativas aguardando liberação de GPU
  for (const [key, oldSession] of activeSessions.entries()) {
    console.log(`[HLS] Encerrando sessão anterior para iniciar nova reprodução: ${oldSession.name}`);
    await terminateSession(oldSession);
    activeSessions.delete(key);
  }

  const actualSeekId = seekId || (startTime > 0 ? Date.now().toString() : '0');
  return createHlsSession(fullPath, relPath, startTime, actualSeekId, spatialType);
}

/**
 * Reinicia explicitamente a sessão HLS para um ponto específico de seek (-ss) e modo de áudio espacial.
 */
export async function restartHlsSession(fullPath, relPath, startTime = 0, seekId = null, spatialType = null) {
  const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);
  const oldSession = activeSessions.get(hash);
  if (oldSession) {
    console.log(`[HLS Seek] Encerrando sessão anterior de "${oldSession.name}" para seek imediato em ${startTime.toFixed(1)}s`);
    await terminateSession(oldSession);
    activeSessions.delete(hash);
  }
  const actualSeekId = seekId || Date.now().toString();
  const session = await createHlsSession(fullPath, relPath, startTime, actualSeekId, spatialType);
  const playlist = await waitForPlaylist(session.playlistPath);
  return { session, playlist, seekId: actualSeekId };
}

// Mapa para debounce de 400ms em requisições de Seek
const seekDebounceMap = new Map();

/**
 * Manipula a API de Seek HLS (/api/hls/seek)
 */
export async function handleHlsSeekRequest(req, res, url, videoDir) {
  let relPath = url.searchParams.get('path') || url.searchParams.get('relPath');
  let startTime = parseFloat(url.searchParams.get('ss') || url.searchParams.get('start') || url.searchParams.get('t') || '0') || 0;
  let seekId = url.searchParams.get('s') || Date.now().toString();
  let spatialType = url.searchParams.get('spatial') || url.searchParams.get('spatialType') || null;

  const extractAndHandle = (targetRel, targetTime, targetSeekId, targetSpatial) => {
    if (!targetRel) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Parâmetro "path" obrigatório' }));
      return;
    }

    const safeRel = path.normalize(targetRel).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = typeof videoDir === 'function' ? videoDir(safeRel) : path.join(videoDir, safeRel);

    if (!fullPath || !fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Arquivo de vídeo não encontrado' }));
      return;
    }

    // Debounce de 400ms: se chegarem múltiplos seeks para o mesmo vídeo, cancela intermediários e atende o último
    const existing = seekDebounceMap.get(safeRel);
    if (existing) {
      clearTimeout(existing.timer);
      try {
        existing.res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        existing.res.end(JSON.stringify({ success: false, superseded: true }));
      } catch {}
    }

    const timer = setTimeout(async () => {
      seekDebounceMap.delete(safeRel);
      try {
        const probe = await probeMedia(fullPath);
        const safeTime = Math.max(0, Math.min(targetTime, Math.max(0, (probe.duration || 10) - 1)));
        const { session, playlist, seekId: actualSeekId } = await restartHlsSession(fullPath, safeRel, safeTime, targetSeekId, targetSpatial);

        const spatialParam = targetSpatial ? `&spatial=${encodeURIComponent(targetSpatial)}` : '';
        const playlistUrl = `/hls/${encodeURIComponent(safeRel)}/master.m3u8?s=${actualSeekId}&ss=${safeTime.toFixed(2)}${spatialParam}`;
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({
          success: true,
          relPath: safeRel,
          startTime: safeTime,
          seekId: actualSeekId,
          playlistUrl,
          duration: probe.duration || 0,
        }));
      } catch (err) {
        console.error('[HLS Seek] Erro ao reiniciar sessão:', err);
        try {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message }));
        } catch {}
      }
    }, 400);

    seekDebounceMap.set(safeRel, { timer, res });
  };

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const json = JSON.parse(body || '{}');
        const finalPath = json.path || json.relPath || relPath;
        const finalTime = json.ss !== undefined ? parseFloat(json.ss) : (json.start !== undefined ? parseFloat(json.start) : (json.t !== undefined ? parseFloat(json.t) : startTime));
        const finalSeekId = json.s || json.seekId || seekId;
        const finalSpatial = json.spatial || json.spatialType || spatialType;
        extractAndHandle(finalPath, finalTime, finalSeekId, finalSpatial);
      } catch {
        extractAndHandle(relPath, startTime, seekId, spatialType);
      }
    });
  } else {
    extractAndHandle(relPath, startTime, seekId, spatialType);
  }
}

/**
 * Manipula requisições de HLS (/hls/...)
 */
export async function handleHlsRequest(req, res, urlOrPathname, videoDir) {
  let pathname = '';
  let searchParams = new URLSearchParams();

  if (typeof urlOrPathname === 'string') {
    pathname = urlOrPathname;
  } else if (urlOrPathname instanceof URL) {
    pathname = decodeURIComponent(urlOrPathname.pathname);
    searchParams = urlOrPathname.searchParams;
  } else {
    const parsed = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(parsed.pathname);
    searchParams = parsed.searchParams;
  }

  // Padrão: /hls/<encoded_rel_path>/<filename>
  const match = pathname.match(/^\/hls\/(.+)\/([^/]+)$/);
  if (!match) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Rota HLS inválida');
    return;
  }

  const rawRel = match[1];
  const resource = match[2]; // 'master.m3u8' ou 'seg_...ts'
  const cleanResource = path.basename(resource);
  if (resource !== cleanResource || resource.includes('..') || resource.includes('/') || resource.includes('\\')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso proibido: identificador de recurso inválido');
    return;
  }

  const relPath = decodeURIComponent(rawRel);
  const safeRel = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = typeof videoDir === 'function' ? videoDir(safeRel) : path.join(videoDir, safeRel);

  if (!fullPath || !fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo de vídeo não encontrado');
    return;
  }

  // 1. Requisição do manifesto (.m3u8)
  if (cleanResource.endsWith('.m3u8')) {
    try {
      const startTime = parseFloat(searchParams.get('ss') || searchParams.get('start') || searchParams.get('t') || '0') || 0;
      const seekId = searchParams.get('s') || null;
      const spatialType = searchParams.get('spatial') || searchParams.get('spatialType') || null;

      const session = await getOrCreateHlsSession(fullPath, relPath, startTime, seekId, spatialType);
      session.lastAccess = Date.now();

      const playlistContent = await waitForPlaylist(session.playlistPath);
      if (!playlistContent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Tempo limite esgotado ao gerar segmentos HLS pelo FFmpeg.');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(playlistContent);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Erro no streaming HLS: ${err.message}`);
      return;
    }
  }

  // 2. Requisição de segmento de vídeo (.ts)
  if (cleanResource.endsWith('.ts')) {
    const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);
    const session = activeSessions.get(hash);

    if (session) {
      session.lastAccess = Date.now();
    }

    const sessionDir = session?.dir || path.join(HLS_BASE_DIR, hash);
    const segmentPath = path.resolve(sessionDir, cleanResource);
    if (!segmentPath.startsWith(sessionDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Acesso proibido');
      return;
    }

    const exists = await waitForSegment(segmentPath);
    if (!exists) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Segmento HLS não encontrado');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(segmentPath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Recurso HLS desconhecido');
}
