const { contextBridge, ipcRenderer } = require('electron');

// Whitelisted, one-way-typed bridge for the auto-update UI only.
// No general ipcRenderer access is exposed to the renderer.
const UPDATE_STATUS_CHANNEL = 'updates:status';
const UPDATE_PROGRESS_CHANNEL = 'updates:progress';

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('updater', {
  getAppVersion: () => ipcRenderer.invoke('updates:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  restartAndInstall: () => ipcRenderer.send('updates:restart-install'),
  onStatus: (callback) => subscribe(UPDATE_STATUS_CHANNEL, callback),
  onProgress: (callback) => subscribe(UPDATE_PROGRESS_CHANNEL, callback)
});
