const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { getBinaryPath, setupBinaryEnv } = require('./binaries.cjs');

// Injeta os binários embutidos (resources/bin ou bin/) no PATH de execução
setupBinaryEnv();

// Aceleração por GPU para renderização WebGL e decodificação acelerada de vídeo
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// Ativa suporte a decodificação por hardware de HEVC (H.265) via Windows Media Foundation
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-mjpeg-decode');

// Registra esquema privilegiado vrvideo:// para retrocompatibilidade
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vrvideo',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow = null;
const VIDEO_EXTS = ['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ts', '.m2ts', '.wmv', '.flv'];

function getArgVideoPath(argv) {
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && !arg.startsWith('--')) {
      const ext = path.extname(arg).toLowerCase();
      if (VIDEO_EXTS.includes(ext) && fs.existsSync(arg)) {
        return path.resolve(arg);
      }
    }
  }
  return null;
}

function getMediaFileInfo(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    url: pathToFileURL(filePath).toString(),
  };
}

function checkCmd(cmd) {
  const binPath = getBinaryPath(cmd);
  return new Promise((resolve) => {
    execFile(binPath, ['-version'], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve({ available: false });
      const line = (stdout || '').split('\n')[0] || '';
      const isBundled = binPath !== cmd && fs.existsSync(binPath);
      resolve({ available: true, version: line.trim(), path: binPath, isBundled });
    });
  });
}

function probeMedia(filePath) {
  return new Promise((resolve) => {
    execFile(getBinaryPath('ffprobe'), [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_name,codec_type,profile,width,height,channels',
      '-of', 'json',
      filePath
    ], { timeout: 6000 }, (err, stdout) => {
      if (err) return resolve({ error: err.message, canProbe: false });
      try {
        const info = JSON.parse(stdout);
        const vStream = (info.streams || []).find((s) => s.codec_type === 'video');
        const aStream = (info.streams || []).find((s) => s.codec_type === 'audio');

        const nativeVideoCodecs = ['h264', 'hevc', 'vp9', 'av1', 'vp8'];
        const nativeAudioCodecs = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'wav'];
        const nativeContainers = ['.mp4', '.m4v', '.webm', '.mov', '.mkv'];

        const ext = path.extname(filePath).toLowerCase();
        const vCodec = vStream?.codec_name ? vStream.codec_name.toLowerCase() : null;
        const aCodec = aStream?.codec_name ? aStream.codec_name.toLowerCase() : null;

        const containerSupported = nativeContainers.includes(ext);
        const videoSupported = !vCodec || nativeVideoCodecs.includes(vCodec);
        const audioSupported = !aCodec || nativeAudioCodecs.includes(aCodec);

        const fullyCompatible = containerSupported && videoSupported && audioSupported;
        const needsFastRemux = !fullyCompatible;

        resolve({
          canProbe: true,
          videoCodec: vCodec,
          audioCodec: aCodec,
          width: vStream?.width || null,
          height: vStream?.height || null,
          containerSupported,
          videoSupported,
          audioSupported,
          fullyCompatible,
          needsFastRemux,
        });
      } catch (e) {
        resolve({ error: e.message, canProbe: false });
      }
    });
  });
}

let activeOptimProc = null;
let detectedEncoder = null;
async function getBestH264Encoder() {
  if (detectedEncoder) return detectedEncoder;
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(getBinaryPath('ffmpeg'), ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=256x256', '-c:v', 'h264_nvenc', '-pix_fmt', 'yuv420p', '-f', 'null', '-']);
      p.on('close', (code) => (code === 0 ? resolve() : reject()));
      p.on('error', reject);
    });
    detectedEncoder = 'h264_nvenc';
  } catch {
    detectedEncoder = 'libx264';
  }
  return detectedEncoder;
}

function optimizeMedia(filePath) {
  return new Promise(async (resolve, reject) => {
    try {
      const probe = await probeMedia(filePath);
      const fileDir = path.dirname(filePath);
      const baseName = path.basename(filePath, path.extname(filePath));
      let outPath = path.join(fileDir, `${baseName}_otimizado.mp4`);

      // Se a pasta do arquivo for protegida/read-only, faz fallback para a pasta temporária
      try {
        fs.accessSync(fileDir, fs.constants.W_OK);
      } catch {
        const tempDir = path.join(os.tmpdir(), 'vrplayer');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        outPath = path.join(tempDir, `${baseName}_otimizado.mp4`);
      }

      // Apenas mantém stream de vídeo se já for h264 (AVC)
      const canCopyVideo = probe.videoCodec === 'h264';
      const canCopyAudio = probe.audioCodec === 'aac';

      const args = ['-y', '-i', filePath];
      if (canCopyVideo) {
        args.push('-c:v', 'copy');
      } else {
        const encoder = await getBestH264Encoder();
        if (encoder === 'h264_nvenc') {
          args.push(
            '-vf', 'scale=min(3840\\,iw):-2',
            '-c:v', 'h264_nvenc',
            '-rc:v', 'vbr',
            '-cq:v', '22',
            '-pix_fmt', 'yuv420p'
          );
        } else {
          args.push(
            '-vf', 'scale=min(3840\\,iw):-2',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '22',
            '-pix_fmt', 'yuv420p'
          );
        }
      }

      if (canCopyAudio) {
        args.push('-c:a', 'copy');
      } else {
        args.push('-c:a', 'aac', '-b:a', '256k');
      }

      args.push('-movflags', '+faststart', outPath);

      if (activeOptimProc) {
        try { activeOptimProc.kill(); } catch {}
      }

      activeOptimProc = spawn(getBinaryPath('ffmpeg'), args);

      activeOptimProc.on('close', (code) => {
        activeOptimProc = null;
        if (code === 0 && fs.existsSync(outPath)) {
          const stat = fs.statSync(outPath);
          resolve({
            success: true,
            path: outPath,
            name: path.basename(outPath),
            size: stat.size,
            url: pathToFileURL(outPath).toString(),
            wasStreamCopy: canCopyVideo,
            probe,
          });
        } else {
          reject(new Error(`Otimização falhou (código ${code})`));
        }
      });

      activeOptimProc.on('error', (err) => {
        activeOptimProc = null;
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#0a0a0c',
    icon: path.join(__dirname, '..', 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    const initFile = getArgVideoPath(process.argv);
    if (initFile) {
      const info = getMediaFileInfo(initFile);
      if (info) mainWindow.webContents.send('open-file', info);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Instância única: se abrir outro vídeo no Windows Explorer, envia para a janela existente
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const videoPath = getArgVideoPath(commandLine);
      if (videoPath) {
        const info = getMediaFileInfo(videoPath);
        if (info) mainWindow.webContents.send('open-file', info);
      }
    }
  });

  app.whenReady().then(() => {
    // Protocolo personalizado para streaming de arquivos locais (com fallback direto)
    protocol.handle('vrvideo', (request) => {
      try {
        const decoded = decodeURIComponent(request.url.replace(/^vrvideo:\/\//, ''));
        const fileUrl = pathToFileURL(decoded).toString();
        return net.fetch(fileUrl);
      } catch (err) {
        console.error('Erro ao transmitir arquivo local:', err);
        return new Response('File not found', { status: 404 });
      }
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  if (activeOptimProc) {
    try { activeOptimProc.kill(); } catch {}
    activeOptimProc = null;
  }
  if (batchProc) {
    try { batchProc.kill(); } catch {}
    batchProc = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar Vídeo para Reproduzir',
    properties: ['openFile'],
    filters: [
      { name: 'Vídeos Compatíveis', extensions: ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'ts', 'm2ts', 'wmv', 'flv'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];
  return getMediaFileInfo(filePath);
});

ipcMain.handle('file:info', (_event, filePath) => {
  return getMediaFileInfo(filePath);
});

ipcMain.handle('window:toggleFullScreen', () => {
  if (!mainWindow) return false;
  const isFull = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(isFull);
  return isFull;
});

ipcMain.handle('window:isFullScreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

// Diagnóstico de codecs e ferramentas multimídia
ipcMain.handle('media:codecDiagnostics', async () => {
  const ffmpeg = await checkCmd('ffmpeg');
  const ffprobe = await checkCmd('ffprobe');
  return {
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
    features: {
      hevcHardwareFlag: true,
      gpuAcceleration: true,
      supportedContainers: ['.mp4', '.mkv', '.webm', '.mov', '.m4v'],
      extendedContainers: ['.avi', '.ts', '.m2ts', '.wmv', '.flv'],
      nativeVideoCodecs: ['H.264 (AVC)', 'HEVC (H.265 GPU)', 'VP9', 'AV1', 'VP8'],
      nativeAudioCodecs: ['AAC', 'MP3', 'Opus', 'Vorbis', 'FLAC', 'WAV'],
      extendedAudioCodecs: ['AC-3 (Dolby)', 'E-AC-3', 'DTS (via remux/FFmpeg)'],
    },
    tools: {
      ffmpeg,
      ffprobe,
    },
  };
});

ipcMain.handle('media:probe', async (_event, filePath) => {
  return probeMedia(filePath);
});

ipcMain.handle('media:optimize', async (_event, filePath) => {
  return optimizeMedia(filePath);
});

ipcMain.handle('media:cancelOptimization', () => {
  if (activeOptimProc) {
    try { activeOptimProc.kill(); } catch {}
    activeOptimProc = null;
    return true;
  }
  return false;
});

// ---------------- Otimização em Lote (Batch) ----------------
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function scanFolderForBatch(folderPath) {
  const list = [];
  if (!folderPath || !fs.existsSync(folderPath)) return list;
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && (ent.name.toLowerCase() === 'otimizados' || ent.name.toLowerCase() === 'optimized')) {
        continue;
      }
      if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        // Não reprocessa arquivos que já possuem a tag de otimização
        if (ent.name.toLowerCase().includes('_otimizado')) {
          continue;
        }
        if (VIDEO_EXTS.includes(ext)) {
          const full = path.join(folderPath, ent.name);
          const stat = fs.statSync(full);
          if (stat.size === 0) continue; // ignora arquivos vazios
          const probe = await probeMedia(full);

          const isIosContainer = ext === '.mp4' || ext === '.mov' || ext === '.m4v';
          const isIosVideo = probe.videoCodec === 'h264';
          const isIosAudio = probe.audioCodec === 'aac' || probe.audioCodec === 'mp3';
          const isIos = isIosContainer && isIosVideo && isIosAudio;

          const canStreamCopy = (probe.videoCodec === 'h264');

          let action = 'ready';
          let actionLabel = 'Já compatível';
          if (!isIos) {
            if (canStreamCopy) {
              action = 'remux';
              actionLabel = ext === '.mkv' ? 'Remux MKV → MP4 (rápido)' : 'Converter áudio para AAC';
            } else {
              action = 'transcode';
              actionLabel = probe.videoCodec === 'hevc' ? 'Converter H.265 (HEVC) → H.264' : 'Converter vídeo para H.264';
            }
          }

          const probeObj = {
            ...probe,
            isIosCompatible: isIos,
            canStreamCopyVideo: canStreamCopy,
            canStreamCopyAudio: isIosAudio,
            action,
            actionLabel,
          };

          list.push({
            name: ent.name,
            fullPath: full,
            size: formatBytes(stat.size),
            sizeBytes: stat.size,
            probe: probeObj,
            isIosCompatible: isIos,
            canStreamCopy,
            action,
            actionLabel,
          });
        }
      }
    }
  } catch (err) {
    console.error('Erro ao ler pasta:', err);
  }
  return list;
}

let batchCancelled = false;
let batchProc = null;

// ---------------- Gerenciamento de Pastas Locais & Biblioteca ----------------
function getConfigFileInfo() {
  const candidates = [
    path.join(__dirname, '..', 'config.json'),
    path.join(process.cwd(), 'config.json'),
    path.join(app.getAppPath(), 'config.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const raw = fs.readFileSync(c, 'utf8');
        return { configPath: c, data: JSON.parse(raw) };
      } catch {}
    }
  }
  return {
    configPath: path.join(__dirname, '..', 'config.json'),
    data: { videoDir: './videos', videoDirs: ['./videos'] },
  };
}

function getMonitoredFolders() {
  const { data } = getConfigFileInfo();
  const dirs = [];
  if (Array.isArray(data.videoDirs)) {
    for (const d of data.videoDirs) {
      if (d && !dirs.includes(d)) dirs.push(d);
    }
  }
  if (data.videoDir && !dirs.includes(data.videoDir)) {
    dirs.push(data.videoDir);
  }
  if (!dirs.length) dirs.push('./videos');
  return dirs;
}

function saveConfigFile(newData) {
  const { configPath } = getConfigFileInfo();
  try {
    fs.writeFileSync(configPath, JSON.stringify(newData, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Erro ao salvar config.json:', err);
    return false;
  }
}

function detectFormatFromName(name) {
  const n = (name || '').toLowerCase().replace(/\.[a-z0-9]+$/, '');
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

async function scanDirectoryRecursive(dir, baseDir, prefix, visited = new Set()) {
  const results = [];
  if (!dir || !fs.existsSync(dir)) return results;
  const resolved = path.resolve(dir);
  if (visited.has(resolved)) return results;
  visited.add(resolved);

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'bin') {
        continue;
      }
      const full = path.join(resolved, ent.name);
      if (ent.isDirectory()) {
        const sub = await scanDirectoryRecursive(full, baseDir, prefix, visited);
        results.push(...sub);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (VIDEO_EXTS.includes(ext)) {
          const stat = fs.statSync(full);
          if (stat.size === 0) continue;
          const rel = prefix
            ? `${prefix}/${path.relative(baseDir, full).replace(/\\/g, '/')}`
            : path.relative(baseDir, full).replace(/\\/g, '/');

          results.push({
            id: full,
            name: ent.name,
            relPath: rel,
            fullPath: full,
            size: formatBytes(stat.size),
            sizeBytes: stat.size,
            url: pathToFileURL(full).toString(),
            formatHint: detectFormatFromName(ent.name),
            resolutionBadge: '',
            durationFormatted: '',
            streamType: 'direct',
          });
        }
      }
    }
  } catch (err) {
    console.error(`Erro ao ler pasta ${dir}:`, err.message);
  }
  return results;
}

async function scanAllLibraryFolders() {
  const folders = getMonitoredFolders();
  const allVideos = [];
  const isMulti = folders.length > 1;

  for (const f of folders) {
    const resolved = path.resolve(f);
    if (!fs.existsSync(resolved)) continue;
    const prefix = isMulti ? path.basename(resolved) : '';
    const items = await scanDirectoryRecursive(resolved, resolved, prefix);
    allVideos.push(...items);
  }

  return allVideos;
}

// IPC Library
ipcMain.handle('library:getLibrary', async () => {
  const rawFolders = getMonitoredFolders();
  const folderStatus = rawFolders.map((f) => ({
    path: f,
    resolved: path.resolve(f),
    exists: fs.existsSync(f),
  }));
  const videos = await scanAllLibraryFolders();
  return {
    folders: folderStatus,
    videos,
  };
});

ipcMain.handle('library:addFolder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Adicionar Pasta com Vídeos VR',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const newPath = result.filePaths[0];

  const { data } = getConfigFileInfo();
  const dirs = Array.isArray(data.videoDirs) ? [...data.videoDirs] : [];
  if (!dirs.some((d) => path.resolve(d) === path.resolve(newPath))) {
    dirs.push(newPath);
    data.videoDirs = dirs;
    data.videoDir = newPath;
    saveConfigFile(data);
  }

  const rawFolders = getMonitoredFolders();
  const folderStatus = rawFolders.map((f) => ({
    path: f,
    resolved: path.resolve(f),
    exists: fs.existsSync(f),
  }));
  const videos = await scanAllLibraryFolders();
  return { folders: folderStatus, videos };
});

ipcMain.handle('library:removeFolder', async (_event, folderPath) => {
  const { data } = getConfigFileInfo();
  let dirs = Array.isArray(data.videoDirs) ? [...data.videoDirs] : [];
  dirs = dirs.filter((d) => path.resolve(d) !== path.resolve(folderPath));
  data.videoDirs = dirs;
  if (data.videoDir && path.resolve(data.videoDir) === path.resolve(folderPath)) {
    data.videoDir = dirs[0] || './videos';
  }
  saveConfigFile(data);

  const rawFolders = getMonitoredFolders();
  const folderStatus = rawFolders.map((f) => ({
    path: f,
    resolved: path.resolve(f),
    exists: fs.existsSync(f),
  }));
  const videos = await scanAllLibraryFolders();
  return { folders: folderStatus, videos };
});

ipcMain.handle('library:rescan', async () => {
  const rawFolders = getMonitoredFolders();
  const folderStatus = rawFolders.map((f) => ({
    path: f,
    resolved: path.resolve(f),
    exists: fs.existsSync(f),
  }));
  const videos = await scanAllLibraryFolders();
  return { folders: folderStatus, videos };
});

ipcMain.handle('library:openFolder', async (_event, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    await shell.openPath(folderPath);
    return true;
  }
  return false;
});

ipcMain.handle('batch:getDefaultFolder', () => {
  const { data } = getConfigFileInfo();
  if (Array.isArray(data.videoDirs) && data.videoDirs.length > 0) {
    const found = data.videoDirs.find((d) => fs.existsSync(d));
    if (found) return found;
  }
  if (data.videoDir && fs.existsSync(data.videoDir) && data.videoDir !== './videos') {
    return data.videoDir;
  }
  return null;
});

ipcMain.handle('batch:selectFolder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar Pasta de Vídeos',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('batch:scan', async (_event, folderPath) => {
  return scanFolderForBatch(folderPath);
});

ipcMain.handle('batch:start', async (event, { folderPath, files }) => {
  batchCancelled = false;
  const results = [];
  const total = files.length;

  for (let i = 0; i < total; i++) {
    if (batchCancelled) break;
    const item = files[i];
    // Salva na mesma pasta do arquivo original com a tag "_otimizado.mp4"
    const fileDir = path.dirname(item.fullPath);
    const baseName = path.basename(item.name, path.extname(item.name));
    const outPath = path.join(fileDir, `${baseName}_otimizado.mp4`);

    mainWindow?.webContents.send('batch:progress', {
      currentIndex: i + 1,
      total,
      currentFile: item.name,
      status: 'processing',
      percent: Math.round((i / total) * 100),
    });

    const canCopyV = item.probe?.canStreamCopyVideo && item.probe?.videoCodec === 'h264';
    const canCopyA = item.probe?.canStreamCopyAudio || item.probe?.audioCodec === 'aac';

    const args = ['-y', '-i', item.fullPath];
    if (canCopyV) {
      args.push('-c:v', 'copy');
    } else {
      const encoder = await getBestH264Encoder();
      if (encoder === 'h264_nvenc') {
        args.push(
          '-vf', 'scale=min(3840\\,iw):-2',
          '-c:v', 'h264_nvenc',
          '-rc:v', 'vbr',
          '-cq:v', '22',
          '-pix_fmt', 'yuv420p'
        );
      } else {
        args.push(
          '-vf', 'scale=min(3840\\,iw):-2',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '22',
          '-pix_fmt', 'yuv420p'
        );
      }
    }

    if (canCopyA) {
      args.push('-c:a', 'copy');
    } else {
      args.push('-c:a', 'aac', '-b:a', '256k');
    }
    args.push('-movflags', '+faststart', outPath);

    try {
      await new Promise((resolve, reject) => {
        batchProc = spawn(getBinaryPath('ffmpeg'), args);
        batchProc.stderr.on('data', (chunk) => {
          const str = chunk.toString();
          const matchSpeed = str.match(/speed=\s*([\d\.]+x)/);
          if (matchSpeed && mainWindow) {
            mainWindow.webContents.send('batch:progress', {
              currentIndex: i + 1,
              total,
              currentFile: item.name,
              speed: matchSpeed[1],
              status: 'processing',
              percent: Math.round(((i + 0.5) / total) * 100),
            });
          }
        });
        batchProc.on('close', (code) => {
          batchProc = null;
          if (code === 0) resolve();
          else reject(new Error(`Código ${code}`));
        });
        batchProc.on('error', (err) => {
          batchProc = null;
          reject(err);
        });
      });
      results.push({ name: item.name, success: true, outPath });
    } catch (err) {
      results.push({ name: item.name, success: false, error: err.message });
    }
  }

  mainWindow?.webContents.send('batch:progress', {
    currentIndex: total,
    total,
    currentFile: '',
    status: batchCancelled ? 'cancelled' : 'completed',
    percent: 100,
    results,
    outTag: '_otimizado.mp4',
  });

  return { success: !batchCancelled, results, outTag: '_otimizado.mp4' };
});

ipcMain.handle('batch:cancel', () => {
  batchCancelled = true;
  if (batchProc) {
    try { batchProc.kill(); } catch {}
    batchProc = null;
    return true;
  }
  return false;
});
