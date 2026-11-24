'use strict';
/**
 * Skystream — JSON persistence layer.
 * All state lives in <userData>/store/*.json and is written atomically.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Store {
  constructor(file) {
    this.file = file;
    this.data = this._load();
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  save() {
    const tmp = this.file + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return value;
  }
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const DEFAULT_SETTINGS = {
  accent: '#3D50FA',
  theme: 'dark', // dark | amoled | light
  defaultQuality: 'auto', // auto | highest | lowest
  rememberPosition: true,
  hardwareAcceleration: true,
  skipIntroSeconds: 0, // 0 = disabled
  autoplayNext: true,
  downloadDir: null, // resolved at runtime
  language: 'en',
  reduceMotion: false,
  subtitleSize: 100, // percent
  subtitleColor: '#FFFFFF',
};

class AppState {
  constructor(userDataDir) {
    this.dir = path.join(userDataDir, 'store');
    this.settings = new Store(path.join(this.dir, 'settings.json'));
    this.library = new Store(path.join(this.dir, 'library.json')); // slug -> entry
    this.repos = new Store(path.join(this.dir, 'repositories.json')); // url -> repo record
    this.plugins = new Store(path.join(this.dir, 'plugins.json')); // filePath -> plugin record
    this.history = new Store(path.join(this.dir, 'search-history.json'));
    this.progress = new Store(path.join(this.dir, 'watch-progress.json')); // key -> {positionMs, durationMs, at}
    this.defaults = DEFAULT_SETTINGS;
  }

  getSettings() {
    return Object.assign({}, DEFAULT_SETTINGS, this.settings.data);
  }

  setSettings(patch) {
    const merged = Object.assign(this.getSettings(), patch || {});
    this.settings.data = merged;
    this.settings.save();
    return merged;
  }

  // --- Library (bookmarks / continue watching) --------------------------------
  libraryList() {
    return Object.values(this.library.data).sort((a, b) => (b.lastTouched || 0) - (a.lastTouched || 0));
  }

  libraryGet(key) {
    return this.library.data[key] || null;
  }

  libraryUpsert(entry) {
    const key = entry.key;
    const prev = this.library.data[key] || {};
    this.library.data[key] = Object.assign(prev, entry, { lastTouched: Date.now() });
    this.library.save();
    return this.library.data[key];
  }

  libraryRemove(key) {
    delete this.library.data[key];
    this.library.save();
  }

  libraryClear() {
    this.library.data = {};
    this.library.save();
  }

  // --- Watch progress -----------------------------------------------------------
  progressGet(key) {
    return this.progress.data[key] || null;
  }

  progressSet(key, positionMs, durationMs) {
    if (!key) return null;
    this.progress.data[key] = { positionMs, durationMs, at: Date.now() };
    this.progress.save();
    return this.progress.data[key];
  }

  progressClear(key) {
    delete this.progress.data[key];
    this.progress.save();
  }

  // --- Repositories -------------------------------------------------------------
  repoList() {
    return Object.values(this.repos.data).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  }

  repoAdd(repo) {
    this.repos.data[repo.url] = Object.assign({ addedAt: Date.now(), enabled: true }, repo);
    this.repos.save();
    return this.repos.data[repo.url];
  }

  repoRemove(url) {
    delete this.repos.data[url];
    this.repos.save();
  }

  repoSetEnabled(url, enabled) {
    if (this.repos.data[url]) {
      this.repos.data[url].enabled = !!enabled;
      this.repos.save();
    }
  }

  // --- Installed plugins ---------------------------------------------------------
  pluginList() {
    return Object.values(this.plugins.data);
  }

  pluginGet(id) {
    return this.plugins.data[id] || null;
  }

  pluginSet(plugin) {
    this.plugins.data[plugin.id] = plugin;
    this.plugins.save();
    return plugin;
  }

  pluginRemove(id) {
    delete this.plugins.data[id];
    this.plugins.save();
  }

  pluginSetEnabled(id, enabled) {
    if (this.plugins.data[id]) {
      this.plugins.data[id].enabled = !!enabled;
      this.plugins.save();
    }
  }

  // --- Search history --------------------------------------------------------------
  historyList() {
    return Array.isArray(this.history.data.items) ? this.history.data.items : [];
  }

  historyAdd(query) {
    const q = String(query || '').trim();
    if (!q) return this.historyList();
    const items = [q].concat(this.historyList().filter((item) => item !== q)).slice(0, 24);
    this.history.data = { items };
    this.history.save();
    return items;
  }

  historyClear() {
    this.history.data = { items: [] };
    this.history.save();
  }
}

module.exports = { AppState, sha256Hex, DEFAULT_SETTINGS };
