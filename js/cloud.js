// Módulo cliente para Streaming e Integração com Nuvem (Torbox & Gofile)
// Permite reprodução direta no Safari (Modo Autônomo) e transcodificação/proxy inteligente via PC.

import { detectFromName } from './detect.js';

const STORAGE_TORBOX_KEY = 'vrp:torbox_api_key';
const STORAGE_GOFILE_KEY = 'vrp:gofile_api_key';
const STORAGE_CLOUD_HISTORY = 'vrp:cloud_history';
const MAX_HISTORY_ITEMS = 25;

export function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * ----------------------------------------------------
 * GERENCIAMENTO DE CREDENCIAIS (Torbox & Gofile)
 * ----------------------------------------------------
 */
export function getTorboxApiKey() {
  try {
    return localStorage.getItem(STORAGE_TORBOX_KEY) || '';
  } catch {
    return '';
  }
}

export async function setTorboxApiKey(key, syncServer = false, serverUrl = '') {
  const cleanKey = (key || '').trim();
  try {
    if (cleanKey) {
      localStorage.setItem(STORAGE_TORBOX_KEY, cleanKey);
    } else {
      localStorage.removeItem(STORAGE_TORBOX_KEY);
    }
  } catch {}

  // Opcional: sincroniza com o config.json do servidor local se conectado
  if (syncServer && serverUrl) {
    try {
      await fetch(`${serverUrl}/api/cloud/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ torboxApiKey: cleanKey }),
      });
    } catch (e) {
      console.warn('Falha ao sincronizar chave Torbox com servidor PC:', e.message);
    }
  }
  return cleanKey;
}

export function getGofileApiKey() {
  try {
    return localStorage.getItem(STORAGE_GOFILE_KEY) || '';
  } catch {
    return '';
  }
}

export function setGofileApiKey(key) {
  const cleanKey = (key || '').trim();
  try {
    if (cleanKey) {
      localStorage.setItem(STORAGE_GOFILE_KEY, cleanKey);
    } else {
      localStorage.removeItem(STORAGE_GOFILE_KEY);
    }
  } catch {}
  return cleanKey;
}

export function getActiveServerUrl(serverUrl) {
  if (serverUrl && typeof serverUrl === 'string') return serverUrl.replace(/\/+$/, '');
  try {
    const raw = localStorage.getItem('vrp:server_url');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'string') return parsed.replace(/\/+$/, '');
    }
  } catch {}
  if (typeof location !== 'undefined' && location.protocol.startsWith('http') && !location.hostname.endsWith('github.io')) {
    return location.origin;
  }
  return '';
}

/**
 * ----------------------------------------------------
 * API TORBOX (Torrents e Web Downloads / Debrid)
 * ----------------------------------------------------
 */
function processTorboxItems(torrentsList = [], webdlList = []) {
  const items = [];
  const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ts']);

  // 1. Processa Torrents
  for (const item of torrentsList) {
    const rawFiles = item.files || [];
    const videoFiles = [];

    for (const f of rawFiles) {
      const ext = (f.name || '').substring((f.name || '').lastIndexOf('.')).toLowerCase();
      const isVideo = VIDEO_EXTS.has(ext) || !ext;
      if (isVideo) {
        const hint = detectFromName(f.name || item.name || '');
        videoFiles.push({
          fileId: f.id,
          name: f.name || f.short_name || 'Vídeo',
          sizeBytes: f.size || 0,
          sizeFormatted: formatBytes(f.size || 0),
          formatHint: hint,
          torrentId: item.id,
          type: 'torrent',
          isMkv: ext === '.mkv',
        });
      }
    }

    items.push({
      id: item.id,
      name: item.name,
      type: 'torrent',
      typeLabel: 'Torrent',
      progress: item.progress,
      state: item.download_state,
      totalSize: formatBytes(item.size),
      sizeBytes: item.size,
      updatedAt: item.updated_at,
      videoFiles,
      hasVideos: videoFiles.length > 0,
    });
  }

  // 2. Processa Web Downloads (Gofile, debrid, downloads diretos no Torbox)
  for (const item of webdlList) {
    const rawFiles = item.files || [item];
    const videoFiles = [];

    for (const f of rawFiles) {
      const fName = f.name || f.short_name || item.name || 'Vídeo WebDL';
      const ext = fName.substring(fName.lastIndexOf('.')).toLowerCase();
      const isVideo = VIDEO_EXTS.has(ext) || !ext;
      if (isVideo) {
        const hint = detectFromName(fName);
        videoFiles.push({
          fileId: f.id ?? 0,
          name: fName,
          sizeBytes: f.size || item.size || 0,
          sizeFormatted: formatBytes(f.size || item.size || 0),
          formatHint: hint,
          torrentId: item.id,
          type: 'webdl',
          isMkv: ext === '.mkv',
        });
      }
    }

    items.push({
      id: item.id,
      name: item.name,
      type: 'webdl',
      typeLabel: 'WebDL',
      progress: item.progress ?? 1,
      state: item.download_state || 'completed',
      totalSize: formatBytes(item.size),
      sizeBytes: item.size,
      updatedAt: item.updated_at,
      videoFiles,
      hasVideos: videoFiles.length > 0,
    });
  }

  return items;
}

export async function fetchTorboxTorrents(apiKey, serverUrl = null) {
  const key = apiKey || getTorboxApiKey();
  if (!key) throw new Error('Chave de API do Torbox não configurada.');

  const sUrl = getActiveServerUrl(serverUrl);
  if (sUrl) {
    try {
      const res = await fetch(`${sUrl}/api/cloud/torbox/list?key=${encodeURIComponent(key)}`);
      if (!res.ok) {
        let errMsg = `Status ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      return processTorboxItems(data.torrents || [], data.webdl || []);
    } catch (err) {
      if (!err.message?.includes('Failed to fetch') && !err.message?.includes('NetworkError')) {
        throw err;
      }
      console.warn('Servidor local inacessível para proxy Torbox, tentando direto...', err.message);
    }
  }

  // Modo direto (Standalone)
  const headers = { Authorization: `Bearer ${key}` };
  let torrentsData = [];
  let webdlData = [];

  try {
    const [torrentsRes, webdlRes] = await Promise.allSettled([
      fetch('https://api.torbox.app/v1/api/torrents/mylist?bypass_cache=true', { headers }),
      fetch('https://api.torbox.app/v1/api/webdl/mylist?bypass_cache=true', { headers }),
    ]);

    if (torrentsRes.status === 'fulfilled' && torrentsRes.value.ok) {
      const json = await torrentsRes.value.json();
      if (json.success && Array.isArray(json.data)) torrentsData = json.data;
    }
    if (webdlRes.status === 'fulfilled' && webdlRes.value.ok) {
      const json = await webdlRes.value.json();
      if (json.success && Array.isArray(json.data)) webdlData = json.data;
    }

    if (torrentsRes.status === 'rejected' && webdlRes.status === 'rejected') {
      throw new Error('Bloqueio de CORS no navegador ao contatar o Torbox. Conecte o app ao servidor do PC (vrplayer.local) para liberar o acesso.');
    }
  } catch (err) {
    if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('NetworkError')) {
      throw new Error('Bloqueio de CORS no navegador ao contatar o Torbox. Conecte o app ao servidor do PC (vrplayer.local) para liberar o acesso.');
    }
    throw err;
  }

  return processTorboxItems(torrentsData, webdlData);
}

export async function requestTorboxStreamUrl(itemId, fileId, apiKey, type = 'torrent', serverUrl = null) {
  const key = apiKey || getTorboxApiKey();
  if (!key) throw new Error('Chave de API do Torbox não informada.');

  const sUrl = getActiveServerUrl(serverUrl);
  if (sUrl) {
    const res = await fetch(`${sUrl}/api/cloud/torbox/requestdl?key=${encodeURIComponent(key)}&id=${encodeURIComponent(itemId)}&fileId=${encodeURIComponent(fileId)}&type=${encodeURIComponent(type)}`);
    if (!res.ok) {
      let errText = `Status ${res.status}`;
      try {
        const j = await res.json();
        if (j.error) errText = j.error;
      } catch {}
      throw new Error(errText);
    }
    const json = await res.json();
    if (!json.success || !json.url) {
      throw new Error(json.error || 'Link de download não gerado pelo Torbox.');
    }
    return json.url;
  }

  // Fallback direto
  const endpoint = type === 'webdl' ? 'webdl' : 'torrents';
  const idParam = type === 'webdl' ? 'web_id' : 'torrent_id';

  const url = `https://api.torbox.app/v1/api/${endpoint}/requestdl?token=${encodeURIComponent(key)}&${idParam}=${itemId}&file_id=${fileId}&zip=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Falha ao obter link de stream do Torbox (Status ${res.status})`);
    }
    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error(json.detail || 'Link de download não gerado pelo Torbox.');
    }
    return json.data;
  } catch (err) {
    if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('NetworkError')) {
      throw new Error('Bloqueio de CORS ao obter link no Torbox. Conecte ao servidor PC para contornar.');
    }
    throw err;
  }
}

export async function addTorboxMagnet(magnet, apiKey, serverUrl = null) {
  const key = apiKey || getTorboxApiKey();
  if (!key) throw new Error('Chave de API do Torbox não informada.');

  const sUrl = getActiveServerUrl(serverUrl);
  if (sUrl) {
    const res = await fetch(`${sUrl}/api/cloud/torbox/add-magnet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, magnet }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Status ${res.status}`);
    }
    return json.data;
  }

  const formData = new FormData();
  formData.append('magnet', magnet.trim());

  const res = await fetch('https://api.torbox.app/v1/api/torrents/createtorrent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Erro ao adicionar torrent no Torbox (Status ${res.status})`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.detail || 'Não foi possível adicionar o torrent ao Torbox.');
  }
  return json.data;
}

export async function addTorboxWebDownload(link, apiKey, serverUrl = null) {
  const key = apiKey || getTorboxApiKey();
  if (!key) throw new Error('Chave de API do Torbox não informada.');

  const sUrl = getActiveServerUrl(serverUrl);
  if (sUrl) {
    const res = await fetch(`${sUrl}/api/cloud/torbox/add-webdl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, link }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Status ${res.status}`);
    }
    return json.data;
  }

  const formData = new FormData();
  formData.append('link', link.trim());

  const res = await fetch('https://api.torbox.app/v1/api/webdl/createwebdownload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Erro ao enviar download para Torbox (Status ${res.status})`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.detail || 'Não foi possível enviar o link para o Torbox.');
  }
  return json.data;
}

/**
 * ----------------------------------------------------
 * RESOLUÇÃO GOFILE
 * ----------------------------------------------------
 */
export function extractGofileId(url) {
  if (!url) return null;
  const str = url.trim();
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

export async function resolveGofileLink(url, serverUrl = null, token = null) {
  const cleanUrl = url.trim();

  // 1. Se for link direto de download de servidor Gofile (srv-fileX... /download/...)
  if (cleanUrl.includes('.gofile.io/download/') || cleanUrl.includes('/download/web/')) {
    const filename = cleanUrl.split('/').pop().split('?')[0] || 'video.mp4';
    return {
      folderName: 'Gofile',
      files: [{
        id: 'direct',
        name: filename,
        sizeBytes: 0,
        sizeFormatted: 'Nuvem',
        link: cleanUrl,
        formatHint: detectFromName(filename),
        isMkv: filename.toLowerCase().endsWith('.mkv'),
      }],
    };
  }

  const effectiveToken = token || getGofileApiKey() || null;

  // 2. Se o servidor do PC estiver conectado, resolve através dele (garante bypass de CORS)
  if (serverUrl) {
    try {
      const q = new URLSearchParams({ url: cleanUrl });
      if (effectiveToken) q.set('token', effectiveToken);
      const res = await fetch(`${serverUrl}/api/cloud/gofile-resolve?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.files) {
          return {
            folderName: data.folderName || 'Gofile',
            files: data.files.map((f) => ({
              ...f,
              formatHint: detectFromName(f.name),
              isMkv: (f.name || '').toLowerCase().endsWith('.mkv'),
            })),
          };
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error && errJson.error.includes('exige')) {
          throw new Error(errJson.error);
        }
      }
    } catch (serverErr) {
      if (serverErr.message && serverErr.message.includes('exige')) {
        throw serverErr;
      }
      console.warn('Falha na resolução de Gofile via PC, tentando cliente direto:', serverErr.message);
    }
  }

  // 3. Resolução no cliente direto (Safari / standalone)
  const contentId = extractGofileId(cleanUrl);
  if (!contentId) {
    throw new Error('Link do Gofile inválido. Exemplo: https://gofile.io/d/abcXYZ ou link direto de download.');
  }

  let clientToken = effectiveToken;
  if (!clientToken) {
    try {
      const accRes = await fetch('https://api.gofile.io/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (accRes.ok) {
        const accJson = await accRes.json();
        if (accJson.status === 'ok') clientToken = accJson.data?.token;
      }
    } catch {}
  }

  const headers = {};
  if (clientToken) headers['Authorization'] = `Bearer ${clientToken}`;

  const res = await fetch(`https://api.gofile.io/contents/${contentId}`, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('A API do Gofile exige o link direto do arquivo ou token de conta. Dica: No site do Gofile, passe o mouse/segure no botão "Download" e selecione "Copiar endereço do link" para colar aqui.');
    }
    throw new Error(`Gofile API retornou status ${res.status}`);
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
      const ext = (item.name || '').substring((item.name || '').lastIndexOf('.')).toLowerCase();
      const isVideo = VIDEO_EXTS.has(ext) || (item.mimetype && item.mimetype.startsWith('video/'));
      if (isVideo) {
        files.push({
          id: item.id,
          name: item.name,
          sizeBytes: item.size || 0,
          sizeFormatted: formatBytes(item.size || 0),
          link: item.link,
          formatHint: detectFromName(item.name),
          isMkv: ext === '.mkv',
        });
      }
    }
  }

  return {
    folderName: json.data.name || 'Gofile',
    files,
  };
}

/**
 * ----------------------------------------------------
 * PREPARAÇÃO INTELIGENTE DE URL DE REPRODUÇÃO
 * ----------------------------------------------------
 */
export function preparePlayableUrl({ directUrl, filename = '', serverUrl = '', forceTranscode = false, forceDownscale = false }) {
  const isMkv = filename.toLowerCase().endsWith('.mkv') || directUrl.toLowerCase().includes('.mkv');
  const isGofile = directUrl.includes('gofile.io');
  const needsPcAssistance = forceDownscale || forceTranscode || isMkv || (isGofile && !!serverUrl);

  // Se precisa de remux/transcoding/downscale do PC e o servidor está disponível
  if (needsPcAssistance && serverUrl) {
    const q = new URLSearchParams({ url: directUrl });
    if (forceDownscale) {
      q.set('downscale', '1');
      q.set('transcode', '1');
    } else if (forceTranscode || isMkv) {
      q.set('transcode', '1');
    }
    return {
      url: `${serverUrl}/api/cloud/stream?${q.toString()}`,
      isStreamProxy: true,
      mode: forceDownscale ? 'pc-downscale-4k' : (forceTranscode || isMkv ? 'pc-transcode' : 'pc-proxy'),
      warning: null,
    };
  }

  // Se for MKV mas o servidor NÃO estiver disponível
  if (isMkv && !serverUrl) {
    return {
      url: directUrl,
      isStreamProxy: false,
      mode: 'direct',
      warning: 'Este vídeo é .MKV. O Safari no iPhone pode não reproduzi-lo sem o servidor do PC ativo para conversão.',
    };
  }

  // Reprodução direta da nuvem (Safari / browser padrão)
  return {
    url: directUrl,
    isStreamProxy: false,
    mode: 'direct',
    warning: null,
  };
}

/**
 * ----------------------------------------------------
 * DOWNLOAD NO PC
 * ----------------------------------------------------
 */
export async function sendDownloadToPc(streamUrl, filename, serverUrl) {
  if (!serverUrl) throw new Error('Servidor do PC não está conectado.');
  const q = new URLSearchParams({
    url: streamUrl,
    name: filename || '',
  });

  const res = await fetch(`${serverUrl}/api/cloud/download?${q.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Servidor retornou status ${res.status}`);
  }
  return await res.json();
}

/**
 * ----------------------------------------------------
 * HISTÓRICO DE VÍDEOS NA NUVEM
 * ----------------------------------------------------
 */
export function getCloudHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_CLOUD_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToCloudHistory(entry) {
  try {
    let list = getCloudHistory();
    // Remove duplicatas pelo link direto ou original
    list = list.filter((i) => i.url !== entry.url && i.name !== entry.name);
    list.unshift({
      id: entry.id || 'cloud_' + Date.now(),
      name: entry.name,
      url: entry.url,
      streamUrl: entry.streamUrl || entry.url,
      sizeFormatted: entry.sizeFormatted || 'Nuvem',
      sizeBytes: entry.sizeBytes || 0,
      formatHint: entry.formatHint || detectFromName(entry.name),
      service: entry.service || 'direto', // 'torbox' | 'gofile' | 'direto'
      addedAt: Date.now(),
    });
    if (list.length > MAX_HISTORY_ITEMS) {
      list = list.slice(0, MAX_HISTORY_ITEMS);
    }
    localStorage.setItem(STORAGE_CLOUD_HISTORY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

export function removeFromCloudHistory(id) {
  try {
    let list = getCloudHistory();
    list = list.filter((i) => i.id !== id);
    localStorage.setItem(STORAGE_CLOUD_HISTORY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

export function clearCloudHistory() {
  try {
    localStorage.removeItem(STORAGE_CLOUD_HISTORY);
  } catch {}
  return [];
}
