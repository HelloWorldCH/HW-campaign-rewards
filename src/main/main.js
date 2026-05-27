const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  dialog,
  nativeImage
} = require('electron');
const path = require('path');
const fs = require('fs');
const LogWatcher = require('./logWatcher');
const settings = require('./settings');

// ─── Debug Logger ───────────────────────────────────────────────────────────

const LOG_FILE = path.join(__dirname, '..', '..', 'debug.log');

function log(level, ...args) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
  const message = args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack}`;
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ');
  const line = `[${timestamp}] [${level}] ${message}\n`;

  // Write to console
  if (level === 'ERROR') console.error(line.trim());
  else console.log(line.trim());

  // Append to debug.log file
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {
    console.error('[Logger] Failed to write log file:', e.message);
  }
}

// Write a separator on startup
try {
  fs.appendFileSync(LOG_FILE,
    `\n${'═'.repeat(60)}\n` +
    `  App Starting — ${new Date().toISOString()}\n` +
    `${'═'.repeat(60)}\n`, 'utf8');
} catch (e) { /* ignore */ }

// ─── Crash Handlers ─────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  log('FATAL', 'Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  log('FATAL', 'Unhandled Rejection:', reason);
});

// Campaign data
let campaignData = { meta: {}, summary: {}, areas: {} };

function loadCampaignData(language = 'en') {
  try {
    const localesPath = path.join(__dirname, '..', 'data', 'locales', language);
    if (!fs.existsSync(localesPath)) return;
    
    // Load global
    const globalPath = path.join(localesPath, 'global.json');
    let globalData = { meta: {}, summary: {} };
    if (fs.existsSync(globalPath)) {
      globalData = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
    }
    
    let areas = {};
    const files = fs.readdirSync(localesPath);
    for (const file of files) {
      if (file !== 'global.json' && file.endsWith('.json')) {
        const actAreas = JSON.parse(fs.readFileSync(path.join(localesPath, file), 'utf8'));
        areas = { ...areas, ...actAreas };
      }
    }
    
    campaignData = {
      meta: globalData.meta,
      summary: globalData.summary,
      areas: areas
    };
    log('INFO', `Loaded campaign data for language: ${language}`);
  } catch (err) {
    log('ERROR', 'Error loading campaign data:', err);
  }
}

let mainWindow = null;
let tray = null;
let logWatcher = null;
let isOverlayVisible = true;

// ─── App Ready ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  log('INFO', 'App ready. Initializing...');
  settings.init(app.getPath('userData'));

  loadCampaignData(settings.get('language') || 'en');

  createOverlayWindow();
  createTray();
  registerHotkeys();
  startLogWatcher();
  setupIPC();
  log('INFO', 'Initialization complete.');
}).catch(err => {
  log('FATAL', 'App ready failed:', err);
});

app.on('window-all-closed', () => {
  // Don't quit on window close — keep in tray
  log('INFO', 'All windows closed (staying in tray).');
});

app.on('will-quit', () => {
  log('INFO', 'App quitting.');
  globalShortcut.unregisterAll();
  if (logWatcher) logWatcher.stop();
});

// ─── Overlay Window ─────────────────────────────────────────────────────────

function createOverlayWindow() {
  const winPos = settings.get('windowPosition') || { x: 50, y: 50 };
  const winSize = settings.get('windowSize') || { width: 380, height: 600 };

  mainWindow = new BrowserWindow({
    x: winPos.x,
    y: winPos.y,
    width: winSize.width,
    height: winSize.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Keep above fullscreen games
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Set opacity from settings
  mainWindow.setOpacity(settings.get('opacity'));

  // Load the overlay HTML
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  log('INFO', 'Overlay window created. Position:', winPos, 'Size:', winSize);

  // Save position and size automatically when moved or resized
  mainWindow.on('moved', () => {
    try {
      const [x, y] = mainWindow.getPosition();
      settings.set('windowPosition', { x, y });
    } catch (err) { log('ERROR', 'moved event error:', err); }
  });
  
  mainWindow.on('resized', () => {
    try {
      const [width, height] = mainWindow.getSize();
      settings.set('windowSize', { width, height });
    } catch (err) { log('ERROR', 'resized event error:', err); }
  });

  // Prevent closing, hide instead
  mainWindow.on('close', (e) => {
    log('INFO', 'Window close event intercepted — hiding instead.');
    e.preventDefault();
    mainWindow.hide();
    isOverlayVisible = false;
    updateTrayMenu();
  });

  // Log renderer crashes
  mainWindow.webContents.on('crashed', (event, killed) => {
    log('FATAL', `Renderer process crashed! killed=${killed}`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log('FATAL', 'Renderer process gone:', details);
  });

  mainWindow.on('unresponsive', () => {
    log('ERROR', 'Window became unresponsive!');
  });

  mainWindow.on('responsive', () => {
    log('INFO', 'Window became responsive again.');
  });
}

// ─── System Tray ────────────────────────────────────────────────────────────

function createTray() {
  // Create a simple 16x16 icon
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    // Fallback: create a simple colored icon
    trayIcon = createFallbackIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('PoE2 Campaign Rewards');
  updateTrayMenu();

  tray.on('click', () => {
    toggleOverlay();
  });
}

function createFallbackIcon() {
  // Create a simple 16x16 gold-colored icon
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const dist = Math.sqrt(Math.pow(x - 7.5, 2) + Math.pow(y - 7.5, 2));
    if (dist < 7) {
      canvas[i * 4] = 212;     // R
      canvas[i * 4 + 1] = 175; // G
      canvas[i * 4 + 2] = 55;  // B
      canvas[i * 4 + 3] = 255; // A
    } else {
      canvas[i * 4 + 3] = 0;   // Transparent
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isOverlayVisible ? '🔽 Hide Overlay' : '🔼 Show Overlay',
      click: toggleOverlay
    },
    { type: 'separator' },
    {
      label: '📋 Browse All Rewards',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('show-all-rewards');
          if (!isOverlayVisible) toggleOverlay();
        }
      }
    },
    { type: 'separator' },
    {
      label: '⚙️ Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('show-settings');
          if (!isOverlayVisible) toggleOverlay();
        }
      }
    },
    { type: 'separator' },
    {
      label: '🔴 Quit',
      click: () => {
        if (logWatcher) logWatcher.stop();
        mainWindow.destroy();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// ─── Toggle Overlay ─────────────────────────────────────────────────────────

function toggleOverlay() {
  log('INFO', 'Toggle overlay. Visible:', isOverlayVisible);
  if (!mainWindow) {
    log('ERROR', 'toggleOverlay: mainWindow is null!');
    return;
  }

  try {
    if (isOverlayVisible) {
      mainWindow.hide();
      isOverlayVisible = false;
      log('INFO', 'Overlay hidden.');
    } else {
      mainWindow.showInactive();
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      isOverlayVisible = true;
      log('INFO', 'Overlay shown.');
    }
    updateTrayMenu();
  } catch (err) {
    log('ERROR', 'toggleOverlay error:', err);
  }
}

// ─── Hotkeys ────────────────────────────────────────────────────────────────

function registerHotkeys() {
  const hotkey = settings.get('hotkey') || 'F12';

  try {
    globalShortcut.register(hotkey, () => {
      toggleOverlay();
    });
    console.log(`[Hotkeys] Registered toggle: ${hotkey}`);
  } catch (err) {
    console.error(`[Hotkeys] Failed to register ${hotkey}:`, err);
  }
}

// ─── Log Watcher ────────────────────────────────────────────────────────────

function startLogWatcher() {
  let logPath = settings.get('clientLogPath');

  // Auto-detect if not set
  if (!logPath) {
    logPath = LogWatcher.findLogFile();
    if (logPath) {
      settings.set('clientLogPath', logPath);
      console.log(`[Main] Auto-detected log file: ${logPath}`);
    }
  }

  if (!logPath) {
    console.log('[Main] No log file found. Waiting for user to configure path.');
    if (mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('watcher-status', 'no-log-file');
      });
    }
    return;
  }

  logWatcher = new LogWatcher(logPath);

  logWatcher.on('areaChange', (data) => {
    try {
      log('INFO', `Area change: "${data.area}"`);

      // Look up rewards for this area
      const rewards = campaignData.areas[data.area] || null;
      log('INFO', `Rewards found: ${rewards ? rewards.rewards.length + ' reward(s)' : 'none'}`);

      // Send to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('area-change', {
          area: data.area,
          timestamp: data.timestamp,
          rewards: rewards
        });

        // Show overlay if hidden and showOnAreaChange is enabled
        if (!isOverlayVisible && settings.get('showOnAreaChange')) {
          mainWindow.showInactive();
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
          isOverlayVisible = true;
          updateTrayMenu();
          log('INFO', 'Overlay auto-shown for area change.');
        }
      } else {
        log('ERROR', 'areaChange: mainWindow is null or destroyed!');
      }
    } catch (err) {
      log('ERROR', 'areaChange handler error:', err);
    }
  });

  logWatcher.on('status', (status) => {
    log('INFO', 'Watcher status:', status);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('watcher-status', status);
    }
  });

  logWatcher.on('error', (err) => {
    log('ERROR', 'LogWatcher error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('watcher-error', err.message);
    }
  });

  logWatcher.start();
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

function setupIPC() {
  // Settings
  ipcMain.handle('get-settings', () => settings.getAll());

  ipcMain.handle('update-settings', (event, updates) => {
    const oldHotkey = settings.get('hotkey');
    const oldLogPath = settings.get('clientLogPath');
    const oldLanguage = settings.get('language');

    settings.update(updates);

    if (updates.language && updates.language !== oldLanguage) {
      loadCampaignData(updates.language);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('language-changed');
      }
    }

    // Re-register hotkey if changed
    if (updates.hotkey && updates.hotkey !== oldHotkey) {
      globalShortcut.unregisterAll();
      registerHotkeys();
    }

    // Restart log watcher if path changed
    if (updates.clientLogPath && updates.clientLogPath !== oldLogPath) {
      if (logWatcher) logWatcher.stop();
      startLogWatcher();
    }

    // Update opacity
    if (updates.opacity !== undefined) {
      mainWindow.setOpacity(updates.opacity);
    }

    return settings.getAll();
  });

  // Campaign data
  ipcMain.handle('get-campaign-data', () => campaignData);

  ipcMain.handle('get-area-rewards', (event, areaName) => {
    return campaignData.areas[areaName] || null;
  });

  ipcMain.handle('get-all-areas', () => {
    return Object.entries(campaignData.areas).map(([name, data]) => ({
      name,
      ...data
    }));
  });

  // Window controls
  ipcMain.handle('toggle-compact', () => {
    const compact = !settings.get('compactMode');
    settings.set('compactMode', compact);
    return compact;
  });

  ipcMain.handle('set-opacity', (event, value) => {
    mainWindow.setOpacity(value);
    settings.set('opacity', value);
  });

  // -- Profiles --
  ipcMain.handle('get-profiles', () => {
    return {
      profiles: settings.get('profiles') || {},
      activeProfileId: settings.get('activeProfileId') || 'Default Character'
    };
  });

  ipcMain.handle('create-profile', (event, profileName) => {
    const profiles = settings.get('profiles') || {};
    const id = Date.now().toString();
    profiles[id] = { id, name: profileName, completedRewards: [] };
    settings.set('profiles', profiles);
    settings.set('activeProfileId', id);
    return { profiles, activeProfileId: id };
  });

  ipcMain.handle('switch-profile', (event, profileId) => {
    settings.set('activeProfileId', profileId);
    return profileId;
  });

  ipcMain.handle('delete-profile', (event, profileId) => {
    const profiles = settings.get('profiles') || {};
    delete profiles[profileId];
    settings.set('profiles', profiles);
    
    // Switch to first available or recreate default
    const keys = Object.keys(profiles);
    let newActive = keys.length > 0 ? keys[0] : null;
    if (!newActive) {
      newActive = 'Default Character';
      profiles[newActive] = { id: newActive, name: 'Default Character', completedRewards: [] };
      settings.set('profiles', profiles);
    }
    settings.set('activeProfileId', newActive);
    
    return { profiles, activeProfileId: newActive };
  });

  ipcMain.handle('toggle-reward-completion', (event, rewardId, completed) => {
    const profiles = settings.get('profiles') || {};
    const activeId = settings.get('activeProfileId') || 'Default Character';
    
    // Fallback/Migration if active profile missing
    if (!profiles[activeId]) {
      profiles[activeId] = { id: activeId, name: activeId, completedRewards: [] };
    }
    
    let completedRewards = profiles[activeId].completedRewards || [];
    
    if (completed) {
      if (!completedRewards.includes(rewardId)) completedRewards.push(rewardId);
    } else {
      completedRewards = completedRewards.filter(id => id !== rewardId);
    }
    
    profiles[activeId].completedRewards = completedRewards;
    settings.set('profiles', profiles);
    
    return completedRewards;
  });

  ipcMain.handle('hide-overlay', () => {
    try {
      log('INFO', 'IPC: hide-overlay requested.');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        isOverlayVisible = false;
        updateTrayMenu();
      }
    } catch (err) {
      log('ERROR', 'hide-overlay error:', err);
    }
  });

  // Mouse events for click-through
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIgnoreMouseEvents(ignore, options || {});
      }
    } catch (err) {
      log('ERROR', 'set-ignore-mouse-events error:', err);
    }
  });

  // Simulate area change (for testing)
  ipcMain.on('simulate-area', (event, areaName) => {
    const rewards = campaignData.areas[areaName] || null;
    mainWindow.webContents.send('area-change', {
      area: areaName,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      rewards: rewards
    });
  });

  // Browse for file
  ipcMain.handle('browse-for-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select PoE2 Client.txt',
      filters: [
        { name: 'Log Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });
}
