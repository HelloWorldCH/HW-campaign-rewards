const fs = require('fs');
const path = require('path');

class Settings {
  constructor() {
    // Store settings in app's user data directory
    this.settingsPath = null;
    this.defaults = {
      clientLogPath: '',
      hotkey: 'F12',
      opacity: 0.9,
      windowPosition: { x: 50, y: 50 },
      windowSize: { width: 380, height: 600 },
      compactMode: false,
      alwaysOnTop: true,
      showOnAreaChange: true,
      autoHideSeconds: 0, // 0 = no auto-hide
      language: 'en',
      profiles: {
        'Default Character': {
          id: 'Default Character',
          name: 'Default Character',
          completedRewards: []
        }
      },
      activeProfileId: 'Default Character'
    };
    this.data = { ...this.defaults };
  }

  /**
   * Initialize with user data path
   */
  init(userDataPath) {
    this.settingsPath = path.join(userDataPath, 'settings.json');
    this.load();
  }

  /**
   * Load settings from disk
   */
  load() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        const saved = JSON.parse(raw);
        this.data = { ...this.defaults, ...saved };
        console.log('[Settings] Loaded from:', this.settingsPath);
      } else {
        console.log('[Settings] No settings file found, using defaults');
        this.data = { ...this.defaults };
      }
    } catch (err) {
      console.error('[Settings] Error loading settings:', err);
      this.data = { ...this.defaults };
    }
  }

  /**
   * Save settings to disk
   */
  save() {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.data, null, 2), 'utf8');
      console.log('[Settings] Saved to:', this.settingsPath);
    } catch (err) {
      console.error('[Settings] Error saving settings:', err);
    }
  }

  /**
   * Get a setting value
   */
  get(key) {
    return this.data[key] !== undefined ? this.data[key] : this.defaults[key];
  }

  /**
   * Set a setting value and save
   */
  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  /**
   * Update multiple settings at once
   */
  update(updates) {
    this.data = { ...this.data, ...updates };
    this.save();
  }

  /**
   * Get all settings
   */
  getAll() {
    return { ...this.data };
  }

  /**
   * Reset to defaults
   */
  reset() {
    this.data = { ...this.defaults };
    this.save();
  }
}

module.exports = new Settings();
