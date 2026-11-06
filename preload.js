'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('commandRecorder', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  exportData: (state) => ipcRenderer.invoke('data:export', state),
  importData: () => ipcRenderer.invoke('data:import')
});
