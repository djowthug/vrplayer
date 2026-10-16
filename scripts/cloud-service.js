// Módulo para streaming e download de vídeos da nuvem (Torbox, Gofile, URLs diretas)
// Suporta proxy com resolução de CORS, remux/transcoding em tempo real via FFmpeg para MKVs,
// e download direto para a biblioteca de vídeos do PC.

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { spawn } from 'child_process';
import { getBinaryPath, setupBinaryEnv } from './bin-paths.js';
import { formatBytes } from '../js/utils/format.js';

setupBinaryEnv();

const activeDownloads = new Map();
let gofileGuestToken = null;
let gofileTokenExpires = 0;

/**
 * Obtém ou renova token de convidado do Gofile se necessário
 */
async function getGofileToken(userToken = null) {
  const token = (userToken && userToken.trim()) || (process.env.GOFILE_TOKEN && process.env.GOFILE_TOKEN.trim());
  if (token) return token;
  if (gofileGuestToken && Date.now() < gofileTokenExpires) {
    return gofileGuestToken;
  }
  try {
    const res = await fetch('https://api.gofile.io/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'ok' && data.data?.token) {
        gofileGuestToken = data.data.token;
        gofileTokenExpires = Date.now() + 1000 * 60 * 60 * 24; // 24h
        return gofileGuestToken;
      }
    }
  } catch (err) {
    console.warn('[Gofile] Erro ao obter guest token:', err.message);
  }
  return null;
}

/**
 * Extrai o contentId de uma URL do Gofile
 * Ex: https://gofile.io/d/abcXYZ -> abcXYZ
 */
export function parseGofileContentId(rawUrl) {
  if (!rawUrl) return null;
  const str = rawUrl.trim();
  // Formato direto de ID
  if (/^[a-zA-Z0-9_-]{4,20}$/.test(str)) return str;
  try {
    const parsed = new URL(str);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && (parts[0] === 'd' || parts[0] === 'contents')) {
      return parts[1];
    }
    if (parts.length === 1) return parts[0];
  } catch {}
  return null;
}

/**
 * Resolve o conteúdo de uma pasta ou link do Gofile
 */
export async function resolveGofile(rawUrl, userToken = null) {
  // Se for URL direta de download do servidor Gofile
  if (rawUrl.includes('.gofile.io/download/') || rawUrl.includes('/download/web/')) {
    const filename = path.basename(new URL(rawUrl).pathname) || 'video.mp4';
    return {
      status: 'ok',
      contentId: 'direct',
      files: [{
        id: 'direct',
        name: filename,
        sizeBytes: 0,
        sizeFormatted: 'Nuvem',
        link: rawUrl,
        isVideo: true,
      }],
    };
  }

  const contentId = parseGofileContentId(rawUrl);
  if (!contentId) {
    throw new Error('Link do Gofile inválido. Exemplo esperado: https://gofile.io/d/abcXYZ ou link direto de download.');
  }

  const token = await getGofileToken(userToken);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const apiUrl = `https://api.gofile.io/contents/${contentId}`;
  const res = await fetch(apiUrl, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('A API do Gofile exige o link direto do arquivo ou token de conta. No Gofile, clique com botão direito em "Download" e copie o link direto para colar aqui.');
    }
    throw new Error(`Gofile API respondeu com status ${res.status}`);
  }

  const json = await res.json();
  if (json.status !== 'ok' || !json.data) {
    throw new Error(json.message || 'Falha ao recuperar arquivos do Gofile');
  }

  const rawChildren = json.data.children || {};
  const childrenList = Array.isArray(rawChildren) ? rawChildren : Object.values(rawChildren);

  const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ts']);
  const files = [];

  for (const item of childrenList) {
    if (item.type === 'file') {
      const ext = path.extname(item.name || '').toLowerCase();
      const isVideo = VIDEO_EXTS.has(ext) || (item.mimetype && item.mimetype.startsWith('video/'));
      files.push({
        id: item.id,
        name: item.name,
        sizeBytes: item.size || 0,
        sizeFormatted: formatBytes(item.size),
        link: item.link,
        isVideo,
        mimetype: item.mimetype || 'video/mp4',
      });
    }
  }

  // Prioriza arquivos de vídeo
  files.sort((a, b) => (b.isVideo ? 1 : 0) - (a.isVideo ? 1 : 0));

  return {
    status: 'ok',
    contentId,
    folderName: json.data.name || 'Gofile',
    count: files.length,
    files,
  };
}

import { detectHardwareEncoder } from './hls-streamer.js';

/**
 * Streaming inteligente de URL remota:
 * - Se for MKV, transcode=1 ou downscale=1: remux ou transcoding/downscale em tempo real via FFmpeg (com GPU NVENC se disponível)
 * - Se for MP4 direto: proxy com suporte a Range requests e headers anti-bloqueio (Gofile / Torbox)
 */
export async function handleCloudStream(req, res, targetUrl, transcode = false, seek = 0, downscale = false) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const isMkv = targetUrl.toLowerCase().includes('.mkv');
  const needsFfmpeg = transcode || downscale || isMkv;

  const isGofile = targetUrl.includes('gofile.io');
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  let gofileToken = '';
  try {
    if (fs.existsSync('config.json')) {
      const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
      gofileToken = cfg.gofileApiKey || cfg.gofileToken || '';
    }
  } catch {}

  if (needsFfmpeg) {
    // Pipeline FFmpeg: Remux ou Transcoding/Downscale em tempo real com aceleração por GPU (NVENC)
    const ffmpegBin = getBinaryPath('ffmpeg');
    const encoderInfo = await detectHardwareEncoder();
    const args = [];

    // Cabeçalhos HTTP para serviços como Gofile que bloqueiam requisições sem Referer/User-Agent
    let httpHeaders = `User-Agent: ${userAgent}\r\n`;
    if (isGofile) {
      httpHeaders += 'Referer: https://gofile.io/\r\nOrigin: https://gofile.io\r\n';
      if (gofileToken) {
        httpHeaders += `Cookie: accountToken=${gofileToken}\r\nAuthorization: Bearer ${gofileToken}\r\n`;
      }
    }
    args.push('-headers', httpHeaders);
    args.push('-hwaccel', 'auto');

    if (seek && !isNaN(seek) && seek > 0) {
      args.push('-ss', String(seek));
    }

    args.push('-i', targetUrl);

    if (downscale) {
      // Filtro de Downscale 4K inteligente: Se a largura for > 3840 (ex: 8K ou 6K), reduz para 3840px.
      // Se já for 4K ou menor, mantém a resolução original.
      args.push('-vf', 'scale=min(3840\\,iw):-2');

      if (encoderInfo.id === 'h264_nvenc') {
        args.push(
          '-c:v', 'h264_nvenc',
          '-preset', 'p2',
          '-tune', 'ull',
          '-rc:v', 'vbr',
          '-cq:v', '22',
          '-b:v', '25M',
          '-maxrate:v', '32M',
          '-bufsize:v', '50M',
          '-pix_fmt', 'yuv420p',
          '-g', '60'
        );
      } else if (encoderInfo.id === 'h264_qsv') {
        args.push(
          '-c:v', 'h264_qsv',
          '-preset', 'veryfast',
          '-global_quality', '22',
          '-b:v', '25M',
          '-maxrate:v', '32M',
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
          '-g', '60'
        );
      }
    } else {
      // Remux direto sem re-encode de vídeo
      args.push('-c:v', 'copy');
    }

    args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
    args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof');
    args.push('-f', 'mp4');
    args.push('pipe:1');

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-cache',
    });

    const ffmpeg = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on('data', (d) => {
      const str = d.toString();
      if (str.includes('Error') || str.includes('Invalid') || str.includes('403') || str.includes('401')) {
        console.warn('[CloudStream FFmpeg]:', str.trim());
      }
    });

    ffmpeg.on('error', (err) => {
      console.error('[CloudStream] Erro no FFmpeg:', err.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Erro no FFmpeg: ' + err.message);
      }
    });

    req.on('close', () => {
      try {
        ffmpeg.kill('SIGKILL');
      } catch {}
    });

    return;
  }

  // Modo Proxy Direto com suporte total a HTTP Range (Range Requests) e headers anti-bloqueio
  const rangeHeader = req.headers.range;
  const clientReq = (targetUrl.startsWith('https:') ? https : http).request(targetUrl, {
    method: 'GET',
    headers: {
      ...(rangeHeader ? { Range: rangeHeader } : {}),
      'User-Agent': userAgent,
      ...(isGofile ? { Referer: 'https://gofile.io/', Origin: 'https://gofile.io' } : {}),
      ...((isGofile && gofileToken) ? { Cookie: `accountToken=${gofileToken}`, Authorization: `Bearer ${gofileToken}` } : {}),
    },
  }, (remoteRes) => {
    // Redirecionamento (301, 302, 307, 308)
    if ([301, 302, 303, 307, 308].includes(remoteRes.statusCode) && remoteRes.headers.location) {
      return handleCloudStream(req, res, remoteRes.headers.location, transcode, seek, downscale);
    }

    const headers = {
      'Content-Type': remoteRes.headers['content-type'] || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    };

    if (remoteRes.headers['content-length']) {
      headers['Content-Length'] = remoteRes.headers['content-length'];
    }
    if (remoteRes.headers['content-range']) {
      headers['Content-Range'] = remoteRes.headers['content-range'];
    }

    res.writeHead(remoteRes.statusCode, headers);
    remoteRes.pipe(res);
  });

  clientReq.on('error', (err) => {
    console.error('[CloudStream] Erro na requisição remota:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Erro ao acessar vídeo remoto: ' + err.message);
    }
  });

  req.on('close', () => {
    clientReq.destroy();
  });

  clientReq.end();
}

/**
 * Inicia o download de um vídeo da nuvem diretamente para a pasta de vídeos do PC
 */
export function startCloudDownload(targetUrl, filename, targetFolder) {
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Sanitiza nome do arquivo
  const safeName = (filename || 'video_' + Date.now() + '.mp4')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .trim();
  const filePath = path.join(targetFolder, safeName);
  const downloadId = 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  const downloadItem = {
    id: downloadId,
    name: safeName,
    url: targetUrl,
    filePath,
    totalBytes: 0,
    downloadedBytes: 0,
    percent: 0,
    speed: '0 MB/s',
    status: 'downloading',
    error: null,
    startedAt: Date.now(),
  };

  activeDownloads.set(downloadId, downloadItem);

  let lastTime = Date.now();
  let lastBytes = 0;

  function doDownload(url) {
    const isHttps = url.startsWith('https:');
    const isGofile = url.includes('gofile.io');
    const req = (isHttps ? https : http).get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(isGofile ? { Referer: 'https://gofile.io/', Origin: 'https://gofile.io' } : {}),
      },
    }, (res) => {
      // Redirecionamento
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return doDownload(res.headers.location);
      }

      if (res.statusCode !== 200 && res.statusCode !== 206) {
        downloadItem.status = 'error';
        downloadItem.error = `Servidor remoto retornou status ${res.statusCode}`;
        return;
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      downloadItem.totalBytes = total;

      const fileStream = fs.createWriteStream(filePath);

      res.on('data', (chunk) => {
        downloadItem.downloadedBytes += chunk.length;
        const now = Date.now();
        if (now - lastTime >= 1000) {
          const deltaBytes = downloadItem.downloadedBytes - lastBytes;
          const deltaSec = (now - lastTime) / 1000;
          const bytesPerSec = deltaBytes / deltaSec;
          downloadItem.speed = formatBytes(bytesPerSec) + '/s';
          if (downloadItem.totalBytes > 0) {
            downloadItem.percent = Math.min(100, Math.round((downloadItem.downloadedBytes / downloadItem.totalBytes) * 100));
          }
          lastTime = now;
          lastBytes = downloadItem.downloadedBytes;
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        downloadItem.status = 'completed';
        downloadItem.percent = 100;
        downloadItem.speed = 'Concluído';
      });

      fileStream.on('error', (err) => {
        downloadItem.status = 'error';
        downloadItem.error = err.message;
        try { fs.unlinkSync(filePath); } catch {}
      });
    });

    req.on('error', (err) => {
      downloadItem.status = 'error';
      downloadItem.error = err.message;
      try { fs.unlinkSync(filePath); } catch {}
    });
  }

  doDownload(targetUrl);

  return downloadItem;
}

/**
 * Retorna o status de todos os downloads ativos/recentes
 */
export function getCloudDownloadStatus() {
  const list = [];
  for (const item of activeDownloads.values()) {
    list.push({
      id: item.id,
      name: item.name,
      totalBytes: item.totalBytes,
      totalFormatted: formatBytes(item.totalBytes),
      downloadedBytes: item.downloadedBytes,
      downloadedFormatted: formatBytes(item.downloadedBytes),
      percent: item.percent,
      speed: item.speed,
      status: item.status,
      error: item.error,
    });
  }
  return list;
}

/**
 * Salva a API Key do Torbox no config.json
 */
export function saveTorboxConfig(apiKey, configPath = 'config.json') {
  let cfg = {};
  if (fs.existsSync(configPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {}
  }
  cfg.torboxApiKey = apiKey || '';
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}

/**
 * Proxy para a API do Torbox (elimina qualquer bloqueio de CORS do navegador)
 */
export async function fetchTorboxListProxy(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Chave de API do Torbox não fornecida.');
  }
  const cleanKey = apiKey.trim();
  const headers = { Authorization: `Bearer ${cleanKey}` };

  const [torrentsRes, webdlRes] = await Promise.allSettled([
    fetch('https://api.torbox.app/v1/api/torrents/mylist?bypass_cache=true', { headers }),
    fetch('https://api.torbox.app/v1/api/webdl/mylist?bypass_cache=true', { headers }),
  ]);

  let torrentsData = [];
  let webdlData = [];
  let lastError = null;

  if (torrentsRes.status === 'fulfilled') {
    if (torrentsRes.value.ok) {
      const json = await torrentsRes.value.json();
      if (json.success && Array.isArray(json.data)) {
        torrentsData = json.data;
      } else if (json.error || json.detail) {
        lastError = json.detail || json.error;
      }
    } else {
      try {
        const errJson = await torrentsRes.value.json();
        if (errJson.error === 'BAD_TOKEN') {
          lastError = 'Chave do Torbox inválida ou expirada. Verifique sua chave no painel do Torbox.';
        } else {
          lastError = errJson.detail || errJson.error || `HTTP ${torrentsRes.value.status}`;
        }
      } catch {
        lastError = `HTTP ${torrentsRes.value.status}`;
      }
    }
  } else {
    lastError = torrentsRes.reason?.message || 'Falha de rede ao conectar com Torbox';
  }

  if (webdlRes.status === 'fulfilled') {
    if (webdlRes.value.ok) {
      const json = await webdlRes.value.json();
      if (json.success && Array.isArray(json.data)) {
        webdlData = json.data;
      }
    }
  }

  if (torrentsData.length === 0 && webdlData.length === 0 && lastError) {
    throw new Error(lastError);
  }

  return {
    success: true,
    torrents: torrentsData,
    webdl: webdlData,
  };
}

export async function requestTorboxStreamUrlProxy(apiKey, id, fileId, type = 'torrent') {
  if (!apiKey || !apiKey.trim()) throw new Error('Chave de API do Torbox não fornecida.');
  const endpoint = type === 'webdl' ? 'webdl' : 'torrents';
  const idParam = type === 'webdl' ? 'web_id' : 'torrent_id';

  const url = `https://api.torbox.app/v1/api/${endpoint}/requestdl?token=${encodeURIComponent(apiKey.trim())}&${idParam}=${encodeURIComponent(id)}&file_id=${encodeURIComponent(fileId)}&zip=false`;
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error === 'BAD_TOKEN') {
        msg = 'Chave do Torbox inválida ou expirada.';
      } else if (j.detail || j.error) {
        msg = j.detail || j.error;
      }
    } catch {}
    throw new Error(`Falha no Torbox: ${msg}`);
  }

  const json = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.detail || json.error || 'Link de download não retornado pelo Torbox.');
  }

  return json.data;
}

export async function createTorboxTorrentProxy(apiKey, magnet) {
  if (!apiKey || !apiKey.trim()) throw new Error('Chave de API do Torbox não fornecida.');
  const formData = new FormData();
  formData.append('magnet', magnet.trim());

  const res = await fetch('https://api.torbox.app/v1/api/torrents/createtorrent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  }
  return json.data;
}

export async function createTorboxWebDownloadProxy(apiKey, link) {
  if (!apiKey || !apiKey.trim()) throw new Error('Chave de API do Torbox não fornecida.');
  const formData = new FormData();
  formData.append('link', link.trim());

  const res = await fetch('https://api.torbox.app/v1/api/webdl/createwebdownload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  }
  return json.data;
}

