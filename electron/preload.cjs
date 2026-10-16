const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  getFileInfo: (filePath) => ipcRenderer.invoke('file:info', filePath),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  getCodecDiagnostics: () => ipcRenderer.invoke('media:codecDiagnostics'),
  probeMedia: (filePath) => ipcRenderer.invoke('media:probe', filePath),
  optimizeMedia: (filePath) => ipcRenderer.invoke('media:optimize', filePath),
  cancelOptimization: () => ipcRenderer.invoke('media:cancelOptimization'),
  batchGetDefaultFolder: () => ipcRenderer.invoke('batch:getDefaultFolder'),
  batchSelectFolder: () => ipcRenderer.invoke('batch:selectFolder'),
  batchScan: (folderPath) => ipcRenderer.invoke('batch:scan', folderPath),
  batchStart: (data) => ipcRenderer.invoke('batch:start', data),
  batchCancel: () => ipcRenderer.invoke('batch:cancel'),
  onBatchProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('batch:progress', handler);
    return () => ipcRenderer.removeListener('batch:progress', handler);
  },
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
  getLibrary: () => ipcRenderer.invoke('library:getLibrary'),
  addLibraryFolder: (folderPath) => ipcRenderer.invoke('library:addFolder', folderPath),
  removeLibraryFolder: (folderPath) => ipcRenderer.invoke('library:removeFolder', folderPath),
  rescanLibrary: () => ipcRenderer.invoke('library:rescan'),
  openFolderInExplorer: (folderPath) => ipcRenderer.invoke('library:openFolder', folderPath),
  profilesGetAll: () => ipcRenderer.invoke('profiles:getAll'),
  profilesGet: (key) => ipcRenderer.invoke('profiles:get', key),
  profilesSave: (key, data) => ipcRenderer.invoke('profiles:save', { key, data }),
  profilesDelete: (key) => ipcRenderer.invoke('profiles:delete', key),
});
