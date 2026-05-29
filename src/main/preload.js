const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('poeOverlay', {
  // Area change listener
  onAreaChange: (callback) => {
    ipcRenderer.on('area-change', (event, data) => callback(data));
  },

  // Character selection screen listener
  onCharacterSelectScreen: (callback) => {
    ipcRenderer.on('character-select-screen', (event, data) => callback(data));
  },

  // Watcher status listener
  onWatcherStatus: (callback) => {
    ipcRenderer.on('watcher-status', (event, status) => callback(status));
  },

  // Error listener
  onError: (callback) => {
    ipcRenderer.on('watcher-error', (event, error) => callback(error));
  },

  // App Info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),

  // Campaign data
  getCampaignData: () => ipcRenderer.invoke('get-campaign-data'),
  getAreaRewards: (areaName) => ipcRenderer.invoke('get-area-rewards', areaName),
  toggleRewardCompletion: (rewardId, completed) => ipcRenderer.invoke('toggle-reward-completion', rewardId, completed),

  // Profiles
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  createProfile: (name) => ipcRenderer.invoke('create-profile', name),
  switchProfile: (id) => ipcRenderer.invoke('switch-profile', id),
  deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
  importCharacters: (accountName) => ipcRenderer.invoke('import-characters', accountName),

  // Window controls
  toggleCompact: () => ipcRenderer.invoke('toggle-compact'),
  setOpacity: (value) => ipcRenderer.invoke('set-opacity', value),
  hideOverlay: () => ipcRenderer.invoke('hide-overlay'),

  // Mouse event forwarding for click-through
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },

  // Test / simulate
  simulateArea: (areaName) => ipcRenderer.send('simulate-area', areaName),

  // Browse for file
  browseForFile: () => ipcRenderer.invoke('browse-for-file'),

  // All areas list
  getAllAreas: () => ipcRenderer.invoke('get-all-areas'),

  // Run Guide
  getRunGuide: () => ipcRenderer.invoke('get-run-guide'),
  toggleRunStep: (stepId, completed) => ipcRenderer.invoke('toggle-run-step', stepId, completed),

  // Tray menu events
  onShowAllRewards: (callback) => {
    ipcRenderer.on('show-all-rewards', () => callback());
  },
  onShowSettings: (callback) => {
    ipcRenderer.on('show-settings', () => callback());
  },
  onLanguageChanged: (callback) => {
    ipcRenderer.on('language-changed', () => callback());
  },

  // Save UI position inside the game window
  savePosition: (pos) => ipcRenderer.send('save-position', pos),
  saveSize: (size) => ipcRenderer.send('save-size', size)
});
