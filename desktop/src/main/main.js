'use strict';
/**
 * Skystream — Electron entry point.
 *
 * Wires the main-process modules (store, extensions, bridge, proxy, downloads)
 * to the renderer over a narrow, explicit IPC surface. The renderer never gets
 * Node access; everything it needs goes through preload.js.
 */
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } = require('electron');

const { AppState } = require('./store');
const { ExtensionManager } = require('./extensions');
const { Bridge } = require('./bridge');
const { MediaProxy } = require('./proxy');
const { DownloadManager } = require('./downloads');
const { compareVersions } = require('./version');

const ACCENT = '#38BDF8';

let state = null;
let extensions = null;
let bridge = null;
let proxy = null;
let downloads = null;
let mainWindow = null;

const isDev = !app.isPackaged;

function getUserData() {
  return app.getPath('userData');
}

function getPluginsDir() {
  return path.join(getUserData(), 'extensions');
}

function getDownloadDir() {
  const configured = state && state.getSettings().downloadDir;
  return configured || path.join(app.getPath('downloads'), 'Skystream');
}

function createWindow() {
  nativeTheme.themeSource = (state && state.getSettings().theme) === 'light' ? 'light' : 'dark';

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0C1016',
    frame: false,
    title: 'Skystream',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// ---------------------------------------------------------------- IPC wiring

function broadcastDownloads() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('downloads:update', downloads.list());
  }
}

function registerIpc() {
  // --- app / window ----------------------------------------------------------
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    accent: ACCENT,
    packaged: app.isPackaged,
    userData: getUserData(),
    pluginsDir: getPluginsDir(),
    downloadDir: getDownloadDir(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    bridge: bridge.status(),
  }));

  ipcMain.handle('updates:check', async () => {
    // Read-only check mirroring the Android updater, without auto-installing
    // anything: finds the newest desktop-v* release that carries an installer
    // for this platform and compares semver against the running app.
    const platformExt = process.platform === 'win32' ? '.exe' : '.AppImage';
    try {
      const res = await fetch('https://api.github.com/repos/Su-borno7/Skystream/releases?per_page=30', {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Skystream-Desktop' },
      });
      if (!res.ok) return { status: 'error', message: `GitHub returned HTTP ${res.status}` };
      const releases = await res.json();
      const candidates = (Array.isArray(releases) ? releases : [])
        .filter((r) => !r.prerelease && !r.draft && typeof r.tag_name === 'string' && r.tag_name.startsWith('desktop-v'))
        .map((r) => {
          const asset = (r.assets || []).find((a) => typeof a.name === 'string' && a.name.endsWith(platformExt));
          return asset ? { version: r.tag_name.slice('desktop-v'.length), url: r.html_url } : null;
        })
        .filter(Boolean)
        .sort((a, b) => compareVersions(b.version, a.version));
      if (candidates.length === 0) return { status: 'error', message: 'No desktop releases with an installer for this platform found' };
      const latest = candidates[0];
      const current = app.getVersion();
      if (compareVersions(latest.version, current) > 0) {
        return { status: 'update-available', version: latest.version, url: latest.url };
      }
      return { status: 'current', current, latest: latest.version };
    } catch (err) {
      return { status: 'error', message: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('app:openExternal', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url);
    return Promise.resolve();
  });

  ipcMain.handle('app:openPath', async (_event, target) => {
    if (typeof target !== 'string' || !target) return 'Invalid path';
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) return 'Path does not exist';
    return shell.openPath(resolved); // '' on success, error message on failure
  });

  ipcMain.handle('app:showItemInFolder', (_event, target) => {
    if (typeof target === 'string' && fs.existsSync(target)) shell.showItemInFolder(target);
    return true;
  });

  ipcMain.handle('app:pickDownloadDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose download folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    state.setSettings({ downloadDir: result.filePaths[0] });
    return result.filePaths[0];
  });

  ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow && mainWindow.close());
  ipcMain.handle('window:isMaximized', () => (mainWindow ? mainWindow.isMaximized() : false));

  // --- settings ----------------------------------------------------------------
  ipcMain.handle('settings:get', () => state.getSettings());
  ipcMain.handle('settings:set', (_event, patch) => {
    const allowed = {};
    for (const [key, value] of Object.entries(patch || {})) allowed[key] = value;
    const merged = state.setSettings(allowed);
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      nativeTheme.themeSource = merged.theme === 'light' ? 'light' : 'dark';
    }
    return merged;
  });

  // --- repositories & extensions ------------------------------------------------
  ipcMain.handle('repos:list', () => extensions.listRepositories());
  ipcMain.handle('repos:add', (_event, url) => extensions.addRepository(url));
  ipcMain.handle('repos:remove', (_event, url) => extensions.removeRepository(url));
  ipcMain.handle('repos:setEnabled', (_event, url, enabled) => extensions.setRepositoryEnabled(url, enabled));
  ipcMain.handle('repos:catalog', () => ExtensionManager.catalog());
  ipcMain.handle('repos:availablePlugins', (_event, opts) => extensions.availablePlugins(opts || {}));

  ipcMain.handle('plugins:listInstalled', () => extensions.listInstalled());
  ipcMain.handle('plugins:install', (_event, plugin, repoUrl) => extensions.install(plugin, repoUrl));
  ipcMain.handle('plugins:uninstall', (_event, id) => extensions.uninstall(id));
  ipcMain.handle('plugins:setEnabled', (_event, id, enabled) => extensions.setEnabled(id, enabled));
  ipcMain.handle('plugins:update', (_event, id) => extensions.update(id));
  ipcMain.handle('plugins:updateAll', () => extensions.updateAll());

  // Re-apply the enabled set to the bridge (extension API registers providers).
  ipcMain.handle('plugins:applyToBridge', async () => {
    const refs = extensions.enabledPluginPaths();
    try {
      return await bridge.reloadPlugins(refs);
    } catch (err) {
      return { providers: [], failed: refs.map((r) => ({ internalName: r.internalName, error: String(err.message || err) })) };
    }
  });

  // --- bridge (extension API) -----------------------------------------------------
  ipcMain.handle('bridge:status', () => bridge.status());
  ipcMain.handle('bridge:providers', () => bridge.providers());
  ipcMain.handle('bridge:home', (_event, provider, page) => bridge.home(provider, page));
  ipcMain.handle('bridge:search', (_event, query, provider, page) => bridge.search(query, provider, page));
  ipcMain.handle('bridge:load', (_event, provider, url) => bridge.load(provider, url));
  ipcMain.handle('bridge:loadLinks', (_event, provider, data, episode) => bridge.loadLinks(provider, data, episode));

  // --- media proxy -------------------------------------------------------------------
  ipcMain.handle('proxy:media', (_event, target, headers) => {
    if (typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
      throw new Error('Only http(s) media URLs can be proxied');
    }
    return proxy.urlFor(target, headers && typeof headers === 'object' ? headers : undefined);
  });

  // --- library -----------------------------------------------------------------------
  ipcMain.handle('library:list', () => state.libraryList());
  ipcMain.handle('library:upsert', (_event, entry) => state.libraryUpsert(entry));
  ipcMain.handle('library:remove', (_event, key) => state.libraryRemove(key));
  ipcMain.handle('library:clear', () => state.libraryClear());

  ipcMain.handle('progress:get', (_event, key) => state.progressGet(key));
  ipcMain.handle('progress:set', (_event, key, positionMs, durationMs) => state.progressSet(key, positionMs, durationMs));
  ipcMain.handle('progress:clear', (_event, key) => state.progressClear(key));

  ipcMain.handle('history:list', () => state.historyList());
  ipcMain.handle('history:add', (_event, query) => state.historyAdd(query));
  ipcMain.handle('history:clear', () => state.historyClear());

  // --- downloads -----------------------------------------------------------------------
  ipcMain.handle('downloads:list', () => downloads.list());
  ipcMain.handle('downloads:enqueue', (_event, job) => {
    if (!job || typeof job.url !== 'string' || !/^https?:\/\//i.test(job.url)) {
      throw new Error('A valid http(s) media URL is required');
    }
    return downloads.enqueue(job);
  });
  ipcMain.handle('downloads:cancel', (_event, id) => downloads.cancel(id));
  ipcMain.handle('downloads:remove', (_event, id, opts) => downloads.remove(id, opts));
}

// ---------------------------------------------------------------- lifecycle

// Hardware acceleration must be disabled before the app is ready; read the
// setting straight from the store (it is populated synchronously by AppState).
try {
  const earlyState = new AppState(app.getPath('userData'));
  if (earlyState.getSettings().hardwareAcceleration === false) {
    app.disableHardwareAcceleration();
  }
} catch { /* unreadable settings — keep default acceleration */ }

app.whenReady().then(async () => {
  state = new AppState(getUserData());

  extensions = new ExtensionManager({
    state,
    pluginsDir: getPluginsDir(),
    onChange: (eventName) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('extensions:changed', eventName); },
    getSettings: () => state.getSettings(),
  });

  proxy = new MediaProxy();
  await proxy.start();

  bridge = new Bridge({
    resourcesPath: isDev ? __dirname : process.resourcesPath,
    devBridgeDir: isDev ? process.env.SKYSTREAM_BRIDGE_DIR || null : null,
    userDataDir: getUserData(),
    onLog: (line) => console.log('[bridge]', line),
  });

  downloads = new DownloadManager({
    getDownloadDir,
    onUpdate: () => broadcastDownloads(),
  });

  registerIpc();
  createWindow();

  // Load the enabled extension set in the background; the renderer starts on
  // built-in screens and fills in provider content when the bridge is ready.
  bridge.start().then((ok) => {
    if (!ok) return;
    const refs = extensions.enabledPluginPaths();
    if (refs.length) bridge.reloadPlugins(refs).catch((err) => console.log('[bridge] initial reload failed:', err));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { if (bridge) bridge.stop(); } catch { /* ignore */ }
  try { if (proxy) proxy.stop(); } catch { /* ignore */ }
});
