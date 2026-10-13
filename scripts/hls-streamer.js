// Módulo de Transcodificação Dinâmica e Streaming HLS em Tempo Real
// Detecta aceleração por GPU (NVENC/QSV), aplica downscale 8K -> 4K (3840px)
// e gerencia sessões e arquivos efêmeros sob demanda para o VR Player.

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn, execFile } from 'child_process';
import { getBinaryPath, setupBinaryEnv } from './bin-paths.js';

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

function terminateSession(session) {
  if (!session) return;
  const child = session.process;
  session.process = null;

  if (child && !child.killed) {
    try {
      if (process.platform === 'win32' && child.pid) {
        // Encerra imediatamente toda a árvore de processos do FFmpeg no Windows
        spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
      } else {
        child.kill('SIGKILL');
      }
    } catch {}
  }

  const dirToDelete = session.dir;
  if (dirToDelete && fs.existsSync(dirToDelete)) {
    // Pequeno atraso para o Windows liberar os handles de arquivo antes da remoção
    setTimeout(() => {
      try {
        if (fs.existsSync(dirToDelete)) {
          fs.rmSync(dirToDelete, { recursive: true, force: true });
        }
      } catch {}
    }, 250);
  }
}

/**
 * Limpa todas as sessões HLS ativas e encerra processos FFmpeg.
 */
export function cleanupAllHlsSessions() {
  for (const [key, session] of activeSessions.entries()) {
    console.log(`[HLS] Encerrando sessão FFmpeg: ${session.name || key}`);
    terminateSession(session);
  }
  activeSessions.clear();
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
      terminateSession(session);
      activeSessions.delete(key);
    }
  }
}, 10000);

async function waitForPlaylist(playlistPath, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (fs.existsSync(playlistPath)) {
      const content = fs.readFileSync(playlistPath, 'utf8');
      if (content.includes('#EXTINF:')) {
        return content;
      }
    }
    await new Promise((r) => setTimeout(r, 150));
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
 * Cria uma nova sessão FFmpeg para o arquivo, opcionalmente a partir de um timestamp de seek (-ss).
 */
async function createHlsSession(fullPath, relPath, startTime = 0, seekId = '0') {
  const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);
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

  // Fast Input Seek: colocado antes de -i para busca instantânea por keyframe no container
  if (startTime > 0) {
    args.push('-ss', startTime.toFixed(2));
  }

  args.push('-hwaccel', 'auto', '-i', fullPath);

  // Filtro de escala: reduz para 3840px de largura se for 8K/acima, mantendo proporção e dimensões pares
  args.push('-vf', 'scale=min(3840\\,iw):-2');

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
      '-g', '60'
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

  // Áudio: converte para AAC estéreo para manter sincronia A/V perfeita e compatibilidade total com iOS
  args.push('-c:a', 'aac', '-b:a', '256k', '-ac', '2');

  // Segmentação HLS: segmentos de 2 segundos para inicialização imediata e lista tipo EVENT
  args.push(
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_segment_type', 'mpegts',
    '-hls_flags', 'temp_file',
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

  const child = spawn(getBinaryPath('ffmpeg'), args);

  child.stderr.on('data', () => {});
  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[HLS] Processo FFmpeg finalizou com código ${code}`);
    }
  });
  child.on('error', (err) => {
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
  };

  activeSessions.set(hash, session);
  return session;
}

/**
 * Cria ou recupera uma sessão de transcodificação HLS em tempo real para o arquivo.
 */
async function getOrCreateHlsSession(fullPath, relPath, startTime = 0, seekId = null) {
  const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);
  let session = activeSessions.get(hash);

  if (session && session.process && !session.process.killed) {
    const diff = Math.abs((session.startTime || 0) - startTime);
    const seekIdDiff = seekId && session.seekId !== seekId;
    if (diff > 1.5 || seekIdDiff) {
      console.log(`[HLS] Reiniciando sessão ativa para "${session.name}" devido a seek (${session.startTime}s -> ${startTime}s)`);
      terminateSession(session);
      activeSessions.delete(hash);
    } else {
      session.lastAccess = Date.now();
      return session;
    }
  }

  // Interrompe outras sessões ativas para priorizar a reprodução atual na GPU/disco
  for (const [key, oldSession] of activeSessions.entries()) {
    console.log(`[HLS] Encerrando sessão anterior para iniciar nova reprodução: ${oldSession.name}`);
    terminateSession(oldSession);
    activeSessions.delete(key);
  }

  const actualSeekId = seekId || (startTime > 0 ? Date.now().toString() : '0');
  return createHlsSession(fullPath, relPath, startTime, actualSeekId);
}

/**
 * Reinicia explicitamente a sessão HLS para um ponto específico de seek (-ss).
 */
export async function restartHlsSession(fullPath, relPath, startTime = 0, seekId = null) {
  const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);
  const oldSession = activeSessions.get(hash);
  if (oldSession) {
    console.log(`[HLS Seek] Encerrando sessão anterior de "${oldSession.name}" para seek imediato em ${startTime.toFixed(1)}s`);
    terminateSession(oldSession);
    activeSessions.delete(hash);
  }
  const actualSeekId = seekId || Date.now().toString();
  const session = await createHlsSession(fullPath, relPath, startTime, actualSeekId);
  const playlist = await waitForPlaylist(session.playlistPath);
  return { session, playlist, seekId: actualSeekId };
}

/**
 * Manipula a API de Seek HLS (/api/hls/seek)
 */
export async function handleHlsSeekRequest(req, res, url, videoDir) {
  let relPath = url.searchParams.get('path') || url.searchParams.get('relPath');
  let startTime = parseFloat(url.searchParams.get('ss') || url.searchParams.get('t') || '0') || 0;
  let seekId = url.searchParams.get('s') || Date.now().toString();

  const handleSeek = async (targetRel, targetTime, targetSeekId) => {
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

    try {
      const probe = await probeMedia(fullPath);
      const safeTime = Math.max(0, Math.min(targetTime, Math.max(0, (probe.duration || 10) - 1)));
      const { session, playlist, seekId: actualSeekId } = await restartHlsSession(fullPath, safeRel, safeTime, targetSeekId);

      const playlistUrl = `/hls/${encodeURIComponent(safeRel)}/master.m3u8?s=${actualSeekId}&ss=${safeTime.toFixed(2)}`;
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
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
  };

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const json = JSON.parse(body || '{}');
        const finalPath = json.path || json.relPath || relPath;
        const finalTime = json.ss !== undefined ? parseFloat(json.ss) : (json.t !== undefined ? parseFloat(json.t) : startTime);
        const finalSeekId = json.s || json.seekId || seekId;
        handleSeek(finalPath, finalTime, finalSeekId);
      } catch {
        handleSeek(relPath, startTime, seekId);
      }
    });
  } else {
    handleSeek(relPath, startTime, seekId);
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
  const relPath = decodeURIComponent(rawRel);
  const safeRel = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = typeof videoDir === 'function' ? videoDir(safeRel) : path.join(videoDir, safeRel);

  if (!fullPath || !fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo de vídeo não encontrado');
    return;
  }

  // 1. Requisição do manifesto (.m3u8)
  if (resource.endsWith('.m3u8')) {
    try {
      const startTime = parseFloat(searchParams.get('ss') || searchParams.get('t') || '0') || 0;
      const seekId = searchParams.get('s') || null;

      const session = await getOrCreateHlsSession(fullPath, relPath, startTime, seekId);
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
  if (resource.endsWith('.ts')) {
    const hash = crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12);
    const session = activeSessions.get(hash);

    if (session) {
      session.lastAccess = Date.now();
    }

    const sessionDir = session?.dir || path.join(HLS_BASE_DIR, hash);
    const segmentPath = path.join(sessionDir, resource);

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
