'use strict';
/**
 * Skystream — preload bridge. Exposes a narrow, explicit API to the renderer.
 * No Node primitives leak into the page.
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('skystream', {
  appInfo: () => invoke('app:info'),
  openExternal: (url) => invoke('app:openExternal', url),
  showItemInFolder: (target) => invoke('app:showItemInFolder', target),
  openPath: (target) => invoke('app:openPath', target),
  pickDownloadDir: () => invoke('app:pickDownloadDir'),

  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggleMaximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:isMaximized'),
    onMaximizedChanged: subscribe('window:maximized'),
  },

  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
  },

  repos: {
    list: () => invoke('repos:list'),
    add: (url) => invoke('repos:add', url),
    remove: (url) => invoke('repos:remove', url),
    setEnabled: (url, enabled) => invoke('repos:setEnabled', url, enabled),
    catalog: () => invoke('repos:catalog'),
    availablePlugins: (opts) => invoke('repos:availablePlugins', opts),
  },

  plugins: {
    list: () => invoke('plugins:listInstalled'),
    install: (plugin, repoUrl) => invoke('plugins:install', plugin, repoUrl),
    uninstall: (id) => invoke('plugins:uninstall', id),
    setEnabled: (id, enabled) => invoke('plugins:setEnabled', id, enabled),
    update: (id) => invoke('plugins:update', id),
    updateAll: () => invoke('plugins:updateAll'),
    applyToBridge: () => invoke('plugins:applyToBridge'),
  },

  onExtensionsChanged: subscribe('extensions:changed'),

  bridge: {
    status: () => invoke('bridge:status'),
    providers: () => invoke('bridge:providers'),
    home: (provider, page) => invoke('bridge:home', provider, page),
    search: (query, provider, page) => invoke('bridge:search', query, provider, page),
    load: (provider, url) => invoke('bridge:load', provider, url),
    loadLinks: (provider, data, episode) => invoke('bridge:loadLinks', provider, data, episode),
  },

  mediaUrl: (target, headers) => invoke('proxy:media', target, headers),

  library: {
    list: () => invoke('library:list'),
    upsert: (entry) => invoke('library:upsert', entry),
    remove: (key) => invoke('library:remove', key),
    clear: () => invoke('library:clear'),
  },

  progress: {
    get: (key) => invoke('progress:get', key),
    set: (key, positionMs, durationMs) => invoke('progress:set', key, positionMs, durationMs),
    clear: (key) => invoke('progress:clear', key),
  },

  history: {
    list: () => invoke('history:list'),
    add: (query) => invoke('history:add', query),
    clear: () => invoke('history:clear'),
  },

  downloads: {
    list: () => invoke('downloads:list'),
    enqueue: (job) => invoke('downloads:enqueue', job),
    cancel: (id) => invoke('downloads:cancel', id),
    remove: (id, opts) => invoke('downloads:remove', id, opts),
    onUpdate: subscribe('downloads:update'),
  },
});
