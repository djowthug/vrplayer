const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  getFileInfo: (filePath) => ipcRenderer.invoke('file:info', filePath),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return file.path || null;
    } catch {
      return file.path || null;
    }
  },
  onOpenFile: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('open-file', handler);
    return () => ipcRenderer.removeListener('open-file', handler);
  },
});
