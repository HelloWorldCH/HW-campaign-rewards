const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class LogWatcher extends EventEmitter {
  constructor(logPath) {
    super();
    this.logPath = logPath;
    this.watcher = null;
    this.fileSize = 0;
    this.buffer = '';
    this.isWatching = false;
    this.pollInterval = null;
    this.AREA_PATTERN = /\[SCENE\] Set Source \[([^\]]+)\]/;
    this.LOGIN_PATTERN = /\[SCENE\] Set Source \[Login\]/i;
    this.CHAR_SELECT_PATTERNS = [
      /Entering character selection/i,
      /\[DEBUG Client \d+\] Client-Safe Instance ID/i,
      /Abnormal disconnect/i
    ];
  }

  /**
   * Start watching the Client.txt log file
   */
  start() {
    if (this.isWatching) return;

    if (!fs.existsSync(this.logPath)) {
      this.emit('error', new Error(`Log file not found: ${this.logPath}`));
      return;
    }

    // Get current file size — we only want new lines
    const stats = fs.statSync(this.logPath);
    this.fileSize = stats.size;
    this.isWatching = true;

    this.emit('status', 'watching');
    console.log(`[LogWatcher] Watching: ${this.logPath}`);
    console.log(`[LogWatcher] Starting from byte offset: ${this.fileSize}`);

    // Use fs.watch for file change notifications
    try {
      this.watcher = fs.watch(this.logPath, (eventType) => {
        if (eventType === 'change') {
          this._readNewLines();
        }
      });

      this.watcher.on('error', (err) => {
        console.error('[LogWatcher] Watcher error:', err);
        this.emit('error', err);
        this._fallbackToPoll();
      });
    } catch (err) {
      console.error('[LogWatcher] Failed to create watcher, falling back to polling:', err);
      this._fallbackToPoll();
    }

    // Also poll every 2s as fallback (fs.watch can miss events on some systems)
    this.pollInterval = setInterval(() => {
      this._readNewLines();
    }, 2000);
  }

  /**
   * Fallback to polling if fs.watch fails
   */
  _fallbackToPoll() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (!this.pollInterval) {
      this.pollInterval = setInterval(() => {
        this._readNewLines();
      }, 1000);
    }
  }

  /**
   * Read new lines appended to the log file
   */
  _readNewLines() {
    try {
      const stats = fs.statSync(this.logPath);

      // File was truncated/rotated
      if (stats.size < this.fileSize) {
        console.log('[LogWatcher] File was truncated, resetting offset');
        this.fileSize = 0;
      }

      // No new data
      if (stats.size === this.fileSize) return;

      const readSize = stats.size - this.fileSize;
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(this.logPath, 'r');

      fs.readSync(fd, buffer, 0, readSize, this.fileSize);
      fs.closeSync(fd);

      this.fileSize = stats.size;

      // Process the new data
      const newData = buffer.toString('utf8');
      this.buffer += newData;

      // Split into lines and process complete ones
      const lines = this.buffer.split('\n');
      // Keep last incomplete line in buffer
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        this._processLine(line.trim());
      }
    } catch (err) {
      // File might be temporarily locked by the game
      if (err.code !== 'EBUSY') {
        console.error('[LogWatcher] Error reading log:', err);
      }
    }
  }

  /**
   * Process a single log line
   */
  _processLine(line) {
    if (!line) return;

    const timestamp = line.substring(0, 19); // YYYY/MM/DD HH:MM:SS

    // Check for Login / character selection screen
    if (this.LOGIN_PATTERN.test(line)) {
      console.log(`[LogWatcher] Character selection screen detected at ${timestamp}`);
      this.emit('characterSelect', { timestamp, raw: line });
      return;
    }

    // Check for other character selection indicators
    for (const pattern of this.CHAR_SELECT_PATTERNS) {
      if (pattern.test(line)) {
        console.log(`[LogWatcher] Character select indicator: "${line.substring(0, 80)}"`);
        this.emit('characterSelect', { timestamp, raw: line });
        return;
      }
    }

    // Normal area change
    const match = line.match(this.AREA_PATTERN);
    if (match) {
      const areaName = match[1];

      console.log(`[LogWatcher] Area change detected: "${areaName}" at ${timestamp}`);

      this.emit('areaChange', {
        area: areaName,
        timestamp: timestamp,
        raw: line
      });
    }
  }

  /**
   * Stop watching
   */
  stop() {
    this.isWatching = false;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.emit('status', 'stopped');
    console.log('[LogWatcher] Stopped');
  }

  /**
   * Check if log file exists
   */
  static findLogFile() {
    const commonPaths = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
      'C:\\Program Files\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
      'D:\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
      'D:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
      'E:\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
      'E:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
      'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
      'C:\\Program Files\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt'
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Simulate an area change (for testing)
   */
  simulateAreaChange(areaName) {
    this.emit('areaChange', {
      area: areaName,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      raw: `[SIMULATED] You have entered ${areaName}.`
    });
  }
}

module.exports = LogWatcher;
