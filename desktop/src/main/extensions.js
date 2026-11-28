'use strict';
/**
 * Cinelab — CloudStream-compatible repository & extension manager.
 *
 * Implements the CloudStream extension ecosystem:
 *   repository manifest:  { name, description?, manifestVersion: 1, pluginLists: [...], iconUrl? }
 *   plugin list (JSON):   [ { url, status, version, apiVersion, name, internalName,
 *                             authors?, description?, tvTypes?, language?, iconUrl?,
 *                             fileSize?, fileHash? /* "sha256-<hex>" *\/ } ]
 *   extension package:    .cs3  = zip(manifest.json + classes.dex)
 *
 * The dex bytecode cannot run on a desktop JVM directly; the Cinelab bridge
 * translates it (see bridge/). This module manages repos, download, verification
 * and installation — the same on-disk layout as the Android app — and hands the
 * enabled plugin set to the bridge for loading.
 */
const fs = require('fs');
const path = require('path');
const { fetchJson, fetchBuffer, normalizeRepoUrl } = require('./http');
const { sha256Hex } = require('./store');
const { compareVersions } = require('./version');

const STATUS_OK = 1;
const STATUS_SLOW = 2;
const STATUS_DOWN = 0;
const STATUS_BETA = 3;

const REPO_CACHE_TTL_MS = 15 * 60 * 1000;

function sanitizeFileName(name) {
  const base = String(name || 'plugin').replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return base.length ? base : 'plugin';
}

function sanitizeRepoDir(url) {
  return sha256Hex(Buffer.from(String(url))).slice(0, 24);
}

/** raw.githubusercontent.com → cdn.jsdelivr.net (same rewriting as the Android app's optional toggle). */
function applyJsdelivrProxy(url, enabled) {
  if (!enabled) return url;
  const m = /^https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/(.*)$/.exec(url);
  return m ? `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}` : url;
}

function repoStatusOf(status) {
  switch (Number(status)) {
    case STATUS_OK: return 'ok';
    case STATUS_SLOW: return 'slow';
    case STATUS_DOWN: return 'down';
    case STATUS_BETA: return 'beta';
    default: return 'ok';
  }
}

class ExtensionManager {
  /**
   * @param {object} opts
   *   state: AppState (from store.js)
   *   pluginsDir: absolute dir where .cs3 files are stored (userData/Extensions)
   *   onChange: (eventName) => void  — notified when the installed set changes
   *   getSettings: () => settings object (for jsdelivr toggle)
   */
  constructor({ state, pluginsDir, onChange, getSettings }) {
    this.state = state;
    this.pluginsDir = pluginsDir;
    this.onChange = onChange || (() => {});
    this.getSettings = getSettings || (() => ({}));
    this._repoCache = new Map(); // url -> {at, repo}
    this._listCache = new Map(); // url -> {at, plugins}
  }

  _jsdelivr(url) {
    return applyJsdelivrProxy(url, !!this.getSettings().jsdelivrProxy);
  }

  async fetchRepository(url, { bypassCache = false } = {}) {
    const now = Date.now();
    const cached = this._repoCache.get(url);
    if (!bypassCache && cached && now - cached.at < REPO_CACHE_TTL_MS) return cached.repo;
    const raw = await fetchJson(this._jsdelivr(url), { timeout: 20000 });
    if (!raw || !Array.isArray(raw.pluginLists) || typeof raw.name !== 'string') {
      throw new Error('Not a valid CloudStream repository manifest (missing name/pluginLists)');
    }
    const repo = {
      url,
      name: String(raw.name),
      description: raw.description != null ? String(raw.description) : '',
      iconUrl: raw.iconUrl != null ? String(raw.iconUrl) : null,
      manifestVersion: Number(raw.manifestVersion || 1),
      pluginLists: raw.pluginLists.map((u) => String(u)),
    };
    this._repoCache.set(url, { at: now, repo });
    return repo;
  }

  async fetchPluginList(listUrl, { bypassCache = false } = {}) {
    const now = Date.now();
    const cached = this._listCache.get(listUrl);
    if (!bypassCache && cached && now - cached.at < REPO_CACHE_TTL_MS) return cached.plugins;
    let raw;
    try {
      raw = await fetchJson(this._jsdelivr(listUrl), { timeout: 20000 });
    } catch (err) {
      throw new Error(`Failed to load plugin list ${listUrl}: ${err.message}`);
    }
    const list = Array.isArray(raw) ? raw : [];
    const plugins = [];
    for (const item of list) {
      if (!item || typeof item.url !== 'string' || typeof item.name !== 'string') continue;
      plugins.push({
        url: item.url,
        status: Number.isFinite(item.status) ? item.status : STATUS_OK,
        version: Number.isFinite(item.version) ? item.version : 1,
        apiVersion: Number.isFinite(item.apiVersion) ? item.apiVersion : 1,
        name: item.name,
        internalName: String(item.internalName || item.name),
        authors: Array.isArray(item.authors) ? item.authors.map(String) : [],
        description: item.description != null ? String(item.description) : '',
        tvTypes: Array.isArray(item.tvTypes) ? item.tvTypes.map(String) : [],
        language: item.language != null ? String(item.language) : null,
        iconUrl: item.iconUrl != null ? String(item.iconUrl) : null,
        fileSize: Number.isFinite(item.fileSize) ? item.fileSize : null,
        fileHash: item.fileHash != null ? String(item.fileHash) : null,
      });
    }
    this._listCache.set(listUrl, { at: now, plugins });
    return plugins;
  }

  async fetchRepoPlugins(url, { bypassCache = false } = {}) {
    const repo = await this.fetchRepository(url, { bypassCache });
    const lists = await Promise.all(
      repo.pluginLists.map((listUrl) => this.fetchPluginList(listUrl, { bypassCache }).catch(() => []))
    );
    const seen = new Set();
    const plugins = [];
    for (const plugin of lists.flat()) {
      if (seen.has(plugin.internalName)) continue;
      seen.add(plugin.internalName);
      plugins.push(plugin);
    }
    return { repo, plugins };
  }

  // ---------------- Repositories (user-managed) -------------------------------

  async addRepository(input) {
    const url = normalizeRepoUrl(input);
    if (!url) throw new Error('Enter a repository URL');
    const repo = await this.fetchRepository(url, { bypassCache: true });
    this.state.repoAdd({ url: repo.url, name: repo.name, description: repo.description, iconUrl: repo.iconUrl, enabled: true });
    this.onChange('repos');
    return repo;
  }

  removeRepository(url) {
    this.state.repoRemove(url);
    // uninstall plugins that came from this repository (mirrors Android behaviour)
    const removed = [];
    for (const plugin of this.state.pluginList()) {
      if (plugin.repoUrl === url) {
        this._removePluginFiles(plugin);
        this.state.pluginRemove(plugin.id);
        removed.push(plugin.id);
      }
    }
    this._repoCache.delete(url);
    this.onChange('repos');
    return { removed };
  }

  setRepositoryEnabled(url, enabled) {
    this.state.repoSetEnabled(url, enabled);
    this.onChange('repos');
  }

  listRepositories() {
    return this.state.repoList().map((repo) => Object.assign({ status: 'ok' }, repo));
  }

  /** Available plugins across all enabled repositories, merged with installed state. */
  async availablePlugins({ bypassCache = false } = {}) {
    const installed = new Map(this.state.pluginList().map((p) => [p.internalName, p]));
    const result = [];
    for (const repo of this.state.repoList()) {
      if (!repo.enabled) continue;
      try {
        const { plugins } = await this.fetchRepoPlugins(repo.url, { bypassCache });
        for (const plugin of plugins) {
          const local = installed.get(plugin.internalName) || null;
          installed.delete(plugin.internalName);
          result.push({
            repo: { url: repo.url, name: repo.name, iconUrl: repo.iconUrl },
            plugin,
            status: repoStatusOf(plugin.status),
            installed: !!local,
            installedVersion: local ? local.version : null,
            updateAvailable: !!local && compareVersions(plugin.version, local.version) > 0,
            enabled: local ? local.enabled : false,
          });
        }
      } catch (err) {
        result.push({ repo: { url: repo.url, name: repo.name, iconUrl: repo.iconUrl }, error: String(err.message || err), plugin: null });
      }
    }
    // plugins from repos that are now disabled/removed: still show as installed
    for (const orphan of installed.values()) {
      result.push({
        repo: { url: orphan.repoUrl, name: '(removed repository)', iconUrl: null },
        plugin: null,
        orphan: { internalName: orphan.internalName, name: orphan.name, version: orphan.version },
        installed: true,
        enabled: orphan.enabled,
        updateAvailable: false,
      });
    }
    return result;
  }

  listInstalled() {
    return this.state.pluginList();
  }

  // ---------------- Plugins (installed) -----------------------------------------

  _pluginDirFor(repoUrl) {
    return path.join(this.pluginsDir, sanitizeRepoDir(repoUrl));
  }

  _pluginPath(repoUrl, internalName) {
    return path.join(this._pluginDirFor(repoUrl), sanitizeFileName(internalName) + '.cs3');
  }

  _removePluginFiles(plugin) {
    try { fs.rmSync(plugin.filePath, { force: true }); } catch { /* best effort */ }
    try {
      const dir = path.dirname(plugin.filePath);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch { /* best effort */ }
  }

  async install(plugin, repoUrl) {
    if (!plugin || typeof plugin.url !== 'string' || !plugin.internalName) {
      throw new Error('Invalid plugin reference');
    }
    const repo = this.state.repoList().find((r) => r.url === repoUrl);
    const filePath = this._pluginPath(repoUrl, plugin.internalName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const buffer = await fetchBuffer(this._jsdelivr(plugin.url), { timeout: 120000, maxBytes: MAX_PLUGIN_BYTES });
    if (plugin.fileHash && typeof plugin.fileHash === 'string') {
      const expected = plugin.fileHash.replace(/^sha256-/i, '').toLowerCase();
      const actual = sha256Hex(buffer);
      if (expected && expected !== actual) {
        throw new Error(`Extension hash mismatch for ${plugin.name} (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…). Refusing to install.`);
      }
    }
    const tmp = filePath + '.part';
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, filePath);

    const record = {
      id: plugin.internalName,
      internalName: plugin.internalName,
      name: plugin.name,
      version: plugin.version,
      apiVersion: plugin.apiVersion,
      language: plugin.language,
      tvTypes: plugin.tvTypes,
      description: plugin.description,
      iconUrl: plugin.iconUrl,
      authors: plugin.authors,
      repoUrl,
      repoName: repo ? repo.name : repoUrl,
      filePath,
      fileSize: buffer.length,
      sha256: sha256Hex(buffer),
      enabled: true,
      installedAt: Date.now(),
    };
    this.state.pluginSet(record);
    this.onChange('plugins');
    return record;
  }

  async uninstall(id) {
    const plugin = this.state.pluginGet(id);
    if (plugin) {
      this._removePluginFiles(plugin);
      this.state.pluginRemove(id);
      this.onChange('plugins');
    }
    return { ok: true };
  }

  setEnabled(id, enabled) {
    this.state.pluginSetEnabled(id, enabled);
    this.onChange('plugins');
  }

  async update(id) {
    const plugin = this.state.pluginGet(id);
    if (!plugin) throw new Error('Plugin not installed');
    const { plugins } = await this.fetchRepoPlugins(plugin.repoUrl, { bypassCache: true });
    const latest = plugins.find((p) => p.internalName === plugin.internalName);
    if (!latest) throw new Error(`${plugin.name} no longer exists in its repository`);
    if (compareVersions(latest.version, plugin.version) <= 0) return { updated: false, plugin };
    const installed = await this.install(latest, plugin.repoUrl); // keeps enabled=true, overwrites record
    return { updated: true, plugin: installed };
  }

  async updateAll() {
    const results = [];
    for (const plugin of this.state.pluginList()) {
      try {
        results.push(await this.update(plugin.id));
      } catch (err) {
        results.push({ updated: false, error: String(err.message || err), id: plugin.id });
      }
    }
    this.onChange('plugins');
    return results;
  }

  /** Payload for the bridge: the set of enabled plugins to load. */
  enabledPluginPaths() {
    return this.state.pluginList().filter((p) => p.enabled && fs.existsSync(p.filePath)).map((p) => ({
      internalName: p.internalName,
      filePath: p.filePath,
    }));
  }

  /** Built-in catalogue of community repositories (verified entries first). */
  static catalog() {
    try {
      const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8'));
      return catalog.sources || [];
    } catch {
      return [];
    }
  }

  async catalogInfo(url) {
    return this.fetchRepository(url);
  }
}

const MAX_PLUGIN_BYTES = 128 * 1024 * 1024;

module.exports = { ExtensionManager, sanitizeFileName, applyJsdelivrProxy, STATUS_OK, STATUS_SLOW, STATUS_DOWN, STATUS_BETA };
