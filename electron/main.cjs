const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Aceleração por GPU para renderização WebGL e decodificação de vídeo fluida
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Registra esquema privilegiado vrvideo:// para streaming de vídeos locais com busca (Range requests)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vrvideo',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;

function getArgVideoPath(argv) {
  const videoExts = ['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi'];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && !arg.startsWith('--')) {
      const ext = path.extname(arg).toLowerCase();
      if (videoExts.includes(ext) && fs.existsSync(arg)) {
        return path.resolve(arg);
      }
    }
  }
  return null;
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
      const stat = fs.statSync(initFile);
      mainWindow.webContents.send('open-file', {
        path: initFile,
        name: path.basename(initFile),
        size: stat.size,
        url: `vrvideo://${encodeURIComponent(initFile)}`,
      });
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
        const stat = fs.statSync(videoPath);
        mainWindow.webContents.send('open-file', {
          path: videoPath,
          name: path.basename(videoPath),
          size: stat.size,
          url: `vrvideo://${encodeURIComponent(videoPath)}`,
        });
      }
    }
  });

  app.whenReady().then(() => {
    // Protocolo personalizado para streaming de arquivos de vídeo no disco com suporte nativo a Range requests
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
      { name: 'Vídeos', extensions: ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    url: `vrvideo://${encodeURIComponent(filePath)}`,
  };
});

ipcMain.handle('file:info', (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    url: `vrvideo://${encodeURIComponent(filePath)}`,
  };
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
