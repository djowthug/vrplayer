// Servidor Node.js para streaming local de vídeos VR para o iPhone
// Suporta HTTP Range Requests (obrigatório para iOS), CORS e HTTPS local via mkcert
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Bonjour } from 'bonjour-service';
import { detectFromName } from './js/detect.js';
import { scanFolderForVideos, optimizeSingleFile, cancelCurrentOptimization } from './scripts/batch-optimize.js';
import { detectHardwareEncoder, handleHlsRequest, handleHlsSeekRequest, cleanupAllHlsSessions, probeMedia } from './scripts/hls-streamer.js';
import { setupBinaryEnv } from './scripts/bin-paths.js';
import { getThumbnailPath } from './scripts/thumbnailer.js';
import {
  handleCloudStream,
  startCloudDownload,
  getCloudDownloadStatus,
  resolveGofile,
  saveTorboxConfig,
  fetchTorboxListProxy,
  requestTorboxStreamUrlProxy,
  createTorboxTorrentProxy,
  createTorboxWebDownloadProxy,
} from './scripts/cloud-service.js';

// Injeta os binários embutidos de bin/ no PATH de execução do servidor
setupBinaryEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, 'config.json');
const CERTS_DIR = path.join(__dirname, 'certs');
const CERT_FILE = path.join(CERTS_DIR, 'cert.pem');
const KEY_FILE = path.join(CERTS_DIR, 'key.pem');
const CA_FILE = path.join(CERTS_DIR, 'rootCA.crt');

export let config = { videoDir: './videos', httpsPort: 8443, httpPort: 8080 };
export let VIDEO_DIRS = [];
export let PRIMARY_VIDEO_DIR = path.resolve('./videos');
export let VIDEO_DIR = PRIMARY_VIDEO_DIR; // Mantém compatibilidade com módulos legados

export function reloadConfig() {
  let cfg = { videoDir: './videos', httpsPort: 8443, httpPort: 8080 };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch {}
  }

  let rawDirs = [];
  if (process.argv.slice(2).length > 0) {
    rawDirs = process.argv.slice(2);
  } else if (cfg.videoDirs && Array.isArray(cfg.videoDirs) && cfg.videoDirs.length > 0) {
    rawDirs = [...cfg.videoDirs];
    if (cfg.videoDir && !rawDirs.includes(cfg.videoDir) && cfg.videoDir !== './videos') {
      rawDirs.push(cfg.videoDir);
    }
  } else if (cfg.videoDir) {
    rawDirs = Array.isArray(cfg.videoDir) ? cfg.videoDir : [cfg.videoDir];
  } else {
    rawDirs = ['./videos'];
  }

  VIDEO_DIRS = rawDirs.map((d) => path.resolve(d));
  if (VIDEO_DIRS.length > 0 && !fs.existsSync(VIDEO_DIRS[0])) {
    try { fs.mkdirSync(VIDEO_DIRS[0], { recursive: true }); } catch {}
  }
  PRIMARY_VIDEO_DIR = VIDEO_DIRS[0] || path.resolve('./videos');
  VIDEO_DIR = PRIMARY_VIDEO_DIR;
  config = cfg;
  return cfg;
}

reloadConfig();

const videoPathMap = new Map();

/**
 * Resolve o caminho absoluto de um arquivo a partir do caminho relativo ou prefixo
 */
export function resolveVideoPath(rel) {
  if (!rel) return null;
  const decoded = decodeURIComponent(rel);
  const safeRel = path.normalize(decoded).replace(/^(\.\.[\/\\])+/, '');

  if (videoPathMap.has(safeRel)) return videoPathMap.get(safeRel);
  if (videoPathMap.has(rel)) return videoPathMap.get(rel);

  // Procura se tem prefixo de pasta (ex: "FilmesVR/video.mp4")
  for (const root of VIDEO_DIRS) {
    const base = path.basename(root);
    if (safeRel.startsWith(base + path.sep) || safeRel.startsWith(base + '/')) {
      const sub = safeRel.slice(base.length + 1);
      const target = path.join(root, sub);
      if (fs.existsSync(target)) return target;
    }
  }

  // Procura diretamente em cada uma das pastas configuradas
  for (const root of VIDEO_DIRS) {
    const target = path.join(root, safeRel);
    if (fs.existsSync(target)) return target;
  }

  return path.join(PRIMARY_VIDEO_DIR, safeRel);
}

let serverOptState = { running: false, current: 0, total: 0, currentFile: '', percent: 0, speed: '' };

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.crt': 'application/x-x509-ca-cert',
};

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.ts']);

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDuration(s) {
  if (!s || !isFinite(s) || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

async function scanVideos(dir, baseDir = dir, prefix = '') {
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const sub = await scanVideos(fullPath, baseDir, prefix);
        results = results.concat(sub);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (VIDEO_EXTS.has(ext)) {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0) continue;
          const fileRel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          const rel = prefix ? `${prefix}/${fileRel}` : fileRel;
          videoPathMap.set(rel, fullPath);
          const hint = detectFromName(ent.name);
          const probe = await probeMedia(fullPath);

          const isDirect = probe && probe.isDirectCompatible;
          const streamUrl = isDirect
            ? `/stream/${encodeURIComponent(rel)}`
            : `/hls/${encodeURIComponent(rel)}/master.m3u8`;

          const w = probe?.width || 0;
          const h = probe?.height || 0;
          let resolutionBadge = '';
          if (w >= 7000 || h >= 3500) resolutionBadge = '8K';
          else if (w >= 3500 || h >= 1800) resolutionBadge = '4K';
          else if (w >= 1900 || h >= 1000) resolutionBadge = '1080p';
          else if (w > 0) resolutionBadge = `${w}p`;

          results.push({
            id: rel,
            name: ent.name,
            relPath: rel,
            size: formatSize(stat.size),
            sizeBytes: stat.size,
            formatHint: hint,
            url: streamUrl,
            thumbUrl: `/api/thumbnail?path=${encodeURIComponent(rel)}`,
            durationFormatted: probe?.duration ? formatDuration(probe.duration) : '',
            resolutionBadge,
            streamType: isDirect ? 'direct' : 'hls',
            needsDownscale: probe?.needsDownscale || false,
            videoCodec: probe?.videoCodec || null,
            audioCodec: probe?.audioCodec || null,
            width: w,
            height: h,
            duration: probe?.duration || 0,
            reason: probe?.reason || '',
          });
        }
      }
    }
  } catch (err) {
    console.error(`Erro ao ler pasta: ${dir}`, err.message);
  }
  return results;
}

async function scanAllVideoDirs() {
  reloadConfig();
  videoPathMap.clear();
  let results = [];
  const isMulti = VIDEO_DIRS.length > 1;

  for (let i = 0; i < VIDEO_DIRS.length; i++) {
    const dir = VIDEO_DIRS[i];
    if (!fs.existsSync(dir)) continue;
    const prefix = isMulti ? path.basename(dir) : '';
    const list = await scanVideos(dir, dir, prefix);
    results = results.concat(list);
  }
  return results;
}

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
}

// Manipulador central de requisições
function handleRequest(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  // 1. Download do Certificado Raiz para iPhone (/ca.crt)
  if (pathname === '/ca.crt' || pathname === '/install-cert') {
    if (fs.existsSync(CA_FILE)) {
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="vrplayer-ca.crt"',
      });
      fs.createReadStream(CA_FILE).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Certificado não encontrado. Execute: npm run cert');
      return;
    }
  }

  // 2. API: Lista de vídeos do computador (/api/videos)
  if (pathname === '/api/videos') {
    scanAllVideoDirs().then((list) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        folder: PRIMARY_VIDEO_DIR,
        folders: VIDEO_DIRS,
        count: list.length,
        videos: list
      }));
    }).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // 2.0.0 API: Listar ou adicionar pastas de vídeos (/api/folders)
  if (pathname === '/api/folders') {
    if (req.method === 'GET') {
      reloadConfig();
      const folderList = VIDEO_DIRS.map((d) => ({
        path: d,
        exists: fs.existsSync(d),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ folders: folderList }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { folder } = JSON.parse(body || '{}');
          if (!folder || typeof folder !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Campo folder obrigatório' }));
            return;
          }
          const cfg = reloadConfig();
          const dirs = Array.isArray(cfg.videoDirs) ? [...cfg.videoDirs] : [];
          if (!dirs.some((d) => path.resolve(d) === path.resolve(folder))) {
            dirs.push(folder);
            cfg.videoDirs = dirs;
            cfg.videoDir = folder;
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
          }
          reloadConfig();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, folders: VIDEO_DIRS }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // 2.0 API: Miniaturas geradas sob demanda (/api/thumbnail?path=...)
  if (pathname === '/api/thumbnail') {
    const rel = url.searchParams.get('path');
    if (!rel) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Parâmetro path obrigatório');
      return;
    }
    const safeRel = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = resolveVideoPath(rel);
    getThumbnailPath(fullPath, safeRel).then((thumbPath) => {
      if (thumbPath && fs.existsSync(thumbPath)) {
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=604800, immutable',
        });
        fs.createReadStream(thumbPath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Miniatura não disponível');
      }
    }).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Erro: ' + err.message);
    });
    return;
  }

  // 2.0.1 API: Telemetria de GPU e Servidor (/api/telemetry)
  if (pathname === '/api/telemetry') {
    detectHardwareEncoder().then((gpu) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        gpuEncoder: gpu.label,
        isHardware: gpu.isHardware,
        gpuVendor: gpu.vendor,
        uptime: Math.round(process.uptime()),
      }));
    }).catch(() => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ gpuEncoder: 'Desconhecido', isHardware: false, uptime: Math.round(process.uptime()) }));
    });
    return;
  }

  // 2.0.2 API: Nuvem (Gofile, Torbox, Streaming inteligente e Download)
  if (pathname === '/api/cloud/gofile-resolve') {
    const targetUrl = url.searchParams.get('url');
    const token = url.searchParams.get('token') || config.gofileToken || null;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Parâmetro url obrigatório' }));
      return;
    }
    resolveGofile(targetUrl, token).then((data) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    }).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (pathname === '/api/cloud/stream') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Parâmetro url obrigatório');
      return;
    }
    const transcode = url.searchParams.get('transcode') === '1';
    const downscale = url.searchParams.get('downscale') === '1' || url.searchParams.get('smooth') === '1' || url.searchParams.get('4k') === '1';
    const seek = parseFloat(url.searchParams.get('seek') || '0');
    handleCloudStream(req, res, targetUrl, transcode, seek, downscale);
    return;
  }

  if (pathname === '/api/cloud/download') {
    const targetUrl = url.searchParams.get('url');
    const filename = url.searchParams.get('name') || '';
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Parâmetro url obrigatório' }));
      return;
    }
    try {
      const item = startCloudDownload(targetUrl, filename, PRIMARY_VIDEO_DIR);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, download: item }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/cloud/download-status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ downloads: getCloudDownloadStatus() }));
    return;
  }

  if (pathname === '/api/cloud/config') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          config.torboxApiKey = parsed.torboxApiKey || '';
          saveTorboxConfig(config.torboxApiKey);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, torboxApiKey: config.torboxApiKey }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'JSON inválido' }));
        }
      });
      return;
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ torboxApiKey: config.torboxApiKey || '' }));
      return;
    }
  }

  // 2.0.3 API: Proxy Torbox (contorna restrições de CORS e preflight OPTIONS do navegador)
  if (pathname === '/api/cloud/torbox/list') {
    const key = url.searchParams.get('key') || req.headers.authorization?.replace(/^Bearer\s+/i, '') || config.torboxApiKey;
    if (!key) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Chave de API do Torbox não fornecida.' }));
      return;
    }
    fetchTorboxListProxy(key).then((data) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    }).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (pathname === '/api/cloud/torbox/requestdl') {
    const key = url.searchParams.get('key') || req.headers.authorization?.replace(/^Bearer\s+/i, '') || config.torboxApiKey;
    const id = url.searchParams.get('id');
    const fileId = url.searchParams.get('fileId') || url.searchParams.get('file_id') || '0';
    const type = url.searchParams.get('type') || 'torrent';
    if (!key || !id) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Parâmetros key e id são obrigatórios.' }));
      return;
    }
    requestTorboxStreamUrlProxy(key, id, fileId, type).then((streamUrl) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, url: streamUrl }));
    }).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (pathname === '/api/cloud/torbox/add-magnet' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const key = parsed.key || config.torboxApiKey;
        const magnet = parsed.magnet;
        if (!key || !magnet) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chave de API e magnet são obrigatórios.' }));
          return;
        }
        createTorboxTorrentProxy(key, magnet).then((result) => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, data: result }));
        }).catch((err) => {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'JSON inválido' }));
      }
    });
    return;
  }

  if (pathname === '/api/cloud/torbox/add-webdl' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const key = parsed.key || config.torboxApiKey;
        const link = parsed.link;
        if (!key || !link) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chave de API e link são obrigatórios.' }));
          return;
        }
        createTorboxWebDownloadProxy(key, link).then((result) => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, data: result }));
        }).catch((err) => {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'JSON inválido' }));
      }
    });
    return;
  }

  // 2.1 API: Otimização de vídeos em lote (/api/optimize/...)
  if (pathname === '/api/optimize/scan') {
    const customFolder = url.searchParams.get('folder');
    const targetDirs = customFolder && fs.existsSync(customFolder) ? [customFolder] : VIDEO_DIRS;
    (async () => {
      let videos = [];
      for (const d of targetDirs) {
        if (fs.existsSync(d)) {
          const v = await scanFolderForVideos(d);
          videos = videos.concat(v);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ folder: targetDirs[0], folders: targetDirs, count: videos.length, videos }));
    })().catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (pathname === '/api/optimize/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(serverOptState));
    return;
  }

  if (pathname === '/api/optimize/cancel') {
    cancelCurrentOptimization();
    serverOptState.running = false;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (pathname === '/api/optimize/start') {
    if (serverOptState.running) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Otimização já em andamento' }));
      return;
    }
    (async () => {
      let videos = [];
      for (const d of VIDEO_DIRS) {
        if (fs.existsSync(d)) {
          const v = await scanFolderForVideos(d);
          videos = videos.concat(v);
        }
      }
      const queue = videos.filter((v) => !v.probe?.isIosCompatible);
      if (!queue.length) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'Todos os vídeos já são compatíveis', count: 0 }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'Otimização iniciada', count: queue.length }));

      serverOptState = { running: true, current: 0, total: queue.length, currentFile: '', percent: 0, speed: '' };

      for (let i = 0; i < queue.length; i++) {
        if (!serverOptState.running) break;
        const item = queue[i];
        serverOptState.current = i + 1;
        serverOptState.currentFile = item.name;
        serverOptState.percent = Math.round((i / queue.length) * 100);
        try {
          await optimizeSingleFile(item, (prog) => {
            if (prog.speed) serverOptState.speed = prog.speed;
          });
        } catch (e) {
          console.error('Erro ao otimizar ' + item.name, e.message);
        }
      }
      serverOptState.running = false;
      serverOptState.percent = 100;
    })().catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // 2.2 Streaming dinâmico HLS com aceleração de GPU e downscale em tempo real (/hls/...)
  if (pathname.startsWith('/hls/')) {
    handleHlsRequest(req, res, url, resolveVideoPath);
    return;
  }

  // 2.3 Seek Dinâmico HLS por reinicialização de sessão FFmpeg (/api/hls/seek)
  if (pathname === '/api/hls/seek') {
    handleHlsSeekRequest(req, res, url, resolveVideoPath);
    return;
  }

  // 3. Streaming de vídeo com suporte obrigatório a HTTP Range (/stream/...)
  if (pathname.startsWith('/stream/')) {
    const rel = pathname.slice('/stream/'.length);
    const fullPath = resolveVideoPath(rel);

    if (!fullPath || !fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Vídeo não encontrado');
      return;
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'video/mp4';

    const range = req.headers.range;
    if (range) {
      // Ex: Range: bytes=0-1024
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }

      const chunkLength = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkLength,
        'Content-Type': contentType,
      });

      fs.createReadStream(fullPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
      });
      fs.createReadStream(fullPath).pipe(res);
    }
    return;
  }

  // 4. Arquivos estáticos do site (PWA)
  let filePath = path.join(process.cwd(), pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(process.cwd(), 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
    
    // Otimização de cache HTTP para carregamento rápido no iPhone/PWA
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache';
    } else if (['.js', '.css', '.png', '.jpg', '.svg', '.ico', '.webmanifest'].includes(ext)) {
      headers['Cache-Control'] = 'public, max-age=86400';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado');
  }
}

// Encerramento seguro para finalizar processos do FFmpeg e mDNS se o servidor for interrompido
let bonjour = null;

function gracefulShutdown() {
  if (bonjour) {
    try {
      bonjour.unpublishAll();
      bonjour.destroy();
    } catch {}
  }
  cleanupAllHlsSessions();
  cancelCurrentOptimization();
  process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Inicia servidores HTTP e HTTPS
const hasCert = fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE);
const localIPs = getLocalIPs();
const primaryIP = localIPs[0] || 'localhost';

// Anúncio mDNS na rede local (Zero-Config para iPhone e Mac/PC)
try {
  bonjour = new Bonjour();
  bonjour.publish({
    name: 'VR Player Server',
    type: 'https',
    port: config.httpsPort,
    host: 'vrplayer.local',
    txt: { app: 'vrplayer', ver: '1.0.0' },
  });
  bonjour.publish({
    name: 'VR Player Cert',
    type: 'http',
    port: config.httpPort,
    host: 'vrplayer.local',
    txt: { app: 'vrplayer-cert', ver: '1.0.0' },
  });
} catch (e) {
  console.warn('⚠️ mDNS Bonjour não iniciado:', e.message);
}

console.log('\n======================================================');
console.log('   VR Player — Servidor Local de Streaming');
console.log('======================================================');
if (VIDEO_DIRS.length === 1) {
  console.log(`📁 Pasta de vídeos: ${VIDEO_DIRS[0]}`);
} else {
  console.log(`📁 Pastas de vídeos monitoradas (${VIDEO_DIRS.length}):`);
  VIDEO_DIRS.forEach((d, idx) => console.log(`   [${idx + 1}] ${d}`));
}

// Detecta e exibe aceleração de GPU disponível
detectHardwareEncoder().then((gpu) => {
  console.log(`⚡ Aceleração por Hardware: ${gpu.label}`);
}).catch(() => {});

if (hasCert) {
  const options = {
    key: fs.readFileSync(KEY_FILE),
    cert: fs.readFileSync(CERT_FILE),
  };
  const httpsServer = https.createServer(options, handleRequest);
  httpsServer.listen(config.httpsPort, '0.0.0.0', () => {
    console.log(`\n🔒 HTTPS ATIVO! Abra no Safari do iPhone:`);
    console.log(`   ✨ https://vrplayer.local:${config.httpsPort}/  (Zero-Config mDNS)`);
    for (const ip of localIPs) {
      console.log(`   👉 https://${ip}:${config.httpsPort}/`);
    }
  });

  // Servidor HTTP simples para redirecionar ou servir o certificado de instalação
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/ca.crt' || url.pathname === '/install-cert') {
      handleRequest(req, res);
    } else {
      const host = (req.headers.host || '').split(':')[0] || primaryIP;
      res.writeHead(301, { Location: `https://${host}:${config.httpsPort}${req.url}` });
      res.end();
    }
  });
  httpServer.listen(config.httpPort, '0.0.0.0', () => {
    console.log(`\n📲 Link rápido para instalar o Certificado no iPhone (abra no Safari):`);
    console.log(`   ✨ http://vrplayer.local:${config.httpPort}/install-cert  (Zero-Config)`);
    for (const ip of localIPs) {
      console.log(`   👉 http://${ip}:${config.httpPort}/install-cert`);
    }
  });
} else {
  const httpServer = http.createServer(handleRequest);
  httpServer.listen(config.httpPort, '0.0.0.0', () => {
    console.log(`\n⚠️  Modo HTTP (sem giroscópio no iPhone por falta de HTTPS).`);
    console.log(`   Acesse: http://vrplayer.local:${config.httpPort}/ ou http://${primaryIP}:${config.httpPort}/`);
    console.log(`\n💡 Para ativar HTTPS e liberar o giroscópio no iPhone:`);
    console.log(`   Execute no terminal: npm run cert\n`);
  });
}
