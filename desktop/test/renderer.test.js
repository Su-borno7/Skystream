'use strict';
/**
 * Renderer smoke tests — runs the real index.html + app.js inside jsdom with a
 * fake `window.cinelab` IPC surface. Verifies:
 *   home rows render from the bridge,
 *   search flow renders results → detail navigation,
 *   movie detail → Play opens the player overlay and resolves links,
 *   tv-series detail → episodes render → episode Play resolves links.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

function makeFakeApi() {
  const settings = {
    accent: '#E0B15C', theme: 'premiere', defaultQuality: 'auto', rememberPosition: true,
    hardwareAcceleration: true, skipIntroSeconds: 0, autoplayNext: true,
    downloadDir: '/tmp/cinelab-downloads', language: 'en', reduceMotion: false,
    subtitleSize: 100, subtitleColor: '#FFFFFF', jsdelivrProxy: false, checkUpdatesOnLaunch: false,
  };
  const homeItem = (n) => ({
    name: `Item ${n}`, url: `https://example.com/item-${n}`, type: 'Movie',
    posterUrl: `https://img.example.com/${n}.jpg`, id: String(n),
  });
  const movieLoad = {
    name: 'Test Movie', url: 'https://example.com/movie', type: 'Movie',
    posterUrl: null, backgroundPosterUrl: null, year: 2024, duration: 120,
    plot: 'A test plot.', score: 8.1, tags: ['underdog', 'space'],
    actors: [{ name: 'Actor One', image: null }],
    recommendations: [homeItem(99)],
    kind: 'movie', dataUrl: 'https://play.example.com/master-data',
  };
  const seriesLoad = {
    name: 'Test Series', url: 'https://example.com/series', type: 'TvSeries',
    posterUrl: null, year: 2023, kind: 'tvseries',
    episodes: {
      None: [
        { data: 'ep-1-data', name: 'Pilot', season: 1, episode: 1 },
        { data: 'ep-2-data', name: 'Second', season: 1, episode: 2 },
      ],
    },
  };
  const calls = { loadLinks: 0, lastEpisode: null };
  const api = {
    appInfo: async () => ({
      version: '1.0.0-test', platform: 'linux', packaged: false,
      userData: '/tmp/cinelab-userdata', downloadDir: '/tmp/cinelab-downloads',
      electron: 'v45', chromium: 'c140', node: 'v22',
      bridge: { java: true, bridgePayload: true, running: true, port: 12345, lastError: null },
    }),
    openExternal: async () => {},
    showItemInFolder: async () => {},
    openPath: async () => '',
    pickDownloadDir: async () => '/tmp/cinelab-downloads',
    window: {
      minimize: async () => {}, toggleMaximize: async () => false, close: async () => {},
      isMaximized: async () => false, onMaximizedChanged: () => () => {},
    },
    settings: {
      get: async () => ({ ...settings }),
      set: async (patch) => Object.assign(settings, patch),
    },
    tmdb: {
      status: async () => ({ hasKey: true }),
      list: async ({ mediaType, section, page } = {}) => ({
        items: [
          { id: 101, mediaType: mediaType || 'movie', name: 'Explore Title', posterUrl: null, year: '2024', rating: 7.9, overview: '' },
        ],
        page: page || 1, totalPages: 1, totalResults: 1,
      }),
      search: async () => ({ items: [], page: 1, totalPages: 1, totalResults: 0 }),
      resolve: async () => null,
    },
    skip: {
      segments: async () => [],
    },
    trakt: {
      status: async () => ({ configured: false, signedIn: false, user: null }),
      signIn: async () => ({ userCode: 'TEST-CODE', verificationUrl: 'https://trakt.tv/activate', expiresIn: 600, interval: 5 }),
      signOut: async () => ({ configured: false, signedIn: false, user: null }),
      scrobble: async () => ({ scrobbled: false, reason: 'not-signed-in' }),
      onChanged: () => () => {},
    },
    repos: {
      list: async () => [],
      add: async () => ({}),
      remove: async () => ({}),
      setEnabled: async () => {},
      catalog: async () => [{ url: 'https://repo.example.com/repo.json', verified: true }],
      availablePlugins: async () => [],
    },
    plugins: {
      list: async () => [],
      install: async () => ({}),
      uninstall: async () => ({}),
      setEnabled: async () => {},
      update: async () => ({ updated: false }),
      updateAll: async () => [],
      applyToBridge: async () => ({ providers: [], failed: [] }),
    },
    onExtensionsChanged: () => () => {},
    bridge: {
      status: async () => ({ running: true }),
      providers: async () => ({
        providers: [
          {
            internalName: 'fakeprovider', name: 'FakeProvider', mainUrl: 'https://fake.example.com',
            lang: 'en', supportedTypes: ['Movie', 'TvSeries'], hasMainPage: true,
            usesWebView: false, providerType: 'Extractor', vpnStatus: 'None',
            instantLinkLoading: false, hasDownloadSupport: false,
          },
        ],
      }),
      home: async () => ({
        provider: 'FakeProvider', page: 1,
        lists: [
          {
            name: 'Trending', hasNext: false,
            rows: [
              { name: 'Trending', isHorizontalImages: false, items: [homeItem(1), homeItem(2), homeItem(3)] },
            ],
          },
        ],
      }),
      search: async (query, provider, page) => ({
        provider, query, page, hasNext: false, items: [homeItem(11), homeItem(12)],
      }),
      load: async (provider, url) => (url.includes('series') ? seriesLoad : movieLoad),
      loadLinks: async (provider, data, episode) => {
        calls.loadLinks += 1;
        calls.lastEpisode = episode;
        return {
          provider,
          links: [
            {
              source: 'TestHost', name: 'Test 720p', url: 'https://cdn.example.com/video.m3u8',
              referer: null, quality: 720, headers: {}, type: 'M3U8',
              isM3u8: true, isDash: false, audioTracks: [],
            },
          ],
          subtitles: [{ lang: 'en', url: 'https://cdn.example.com/subs.vtt', headers: {} }],
        };
      },
    },
    mediaUrl: async (url) => `http://127.0.0.1:9999/media?u=${encodeURIComponent(url)}`,
    library: { list: async () => [], upsert: async () => ({}), remove: async () => {}, clear: async () => {} },
    progress: { get: async () => null, set: async () => ({}), clear: async () => {} },
    history: { list: async () => ['earlier search'], add: async () => ['earlier search'], clear: async () => {} },
    downloads: {
      list: async () => [],
      enqueue: async () => ({ id: 'dl-1' }),
      cancel: async () => ({}),
      remove: async () => ({}),
      onUpdate: () => () => {},
    },
  };
  return { api, calls, homeItem };
}

async function flush(times = 30) {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function boot() {
  const dom = new JSDOM(html, {
    url: 'http://localhost/#/home',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function pause() {};
  window.HTMLMediaElement.prototype.load = function load() {};
  const fake = makeFakeApi();
  window.cinelab = fake.api;
  window.eval(appJs);
  await flush();
  return { dom, window, fake };
}

test('home renders provider rows and poster cards from the bridge', async () => {
  const { window } = await boot();
  const doc = window.document;
  assert.equal(doc.querySelector('#screen-home').hidden, false);
  assert.equal(doc.querySelector('#home-offline').hidden, true);
  const cards = doc.querySelectorAll('#home-body .poster-card');
  assert.ok(cards.length >= 3, `expected >=3 poster cards, got ${cards.length}`);
  assert.match(doc.querySelector('#bridge-text').textContent, /FakeProvider|provider/i);
  // Première redesign: featured hero banner renders from the first home item
  const hero = doc.querySelector('#home-hero');
  assert.equal(hero.hidden, false, 'hero is visible on home');
  assert.match(hero.textContent, /Featured tonight/i);
  assert.match(hero.textContent, /Item 1/);
});

test('search runs, renders results, and navigates to detail', async () => {
  const { window } = await boot();
  const doc = window.document;
  window.location.hash = '#/search';
  await flush();
  doc.querySelector('#search-input').value = 'test query';
  doc.querySelector('#search-go').click();
  await flush();
  const cards = doc.querySelectorAll('#search-results .poster-card');
  assert.equal(cards.length, 2);
  assert.match(doc.querySelector('#search-meta').textContent, /2 result/);
  cards[0].click();
  await flush();
  assert.match(window.location.hash, /#\/detail\/fakeprovider\//);
  assert.match(doc.querySelector('#screen-detail').textContent, /Test Movie/);
});

test('movie detail Play resolves links and opens the player overlay', async () => {
  const { window, fake } = await boot();
  const doc = window.document;
  window.location.hash = `#/detail/fakeprovider/${encodeURIComponent('https://example.com/movie')}`;
  await flush();
  assert.match(doc.querySelector('#screen-detail').textContent, /Test Movie/);
  const playBtn = [...doc.querySelectorAll('#screen-detail button')].find((b) => /Play/.test(b.textContent));
  assert.ok(playBtn, 'play button exists');
  playBtn.click();
  await flush();
  assert.equal(fake.calls.loadLinks, 1);
  assert.equal(doc.querySelector('#player-overlay').hidden, false);
  assert.equal(doc.querySelector('#pc-engine').textContent, 'native'); // jsdom has no media engines
  assert.equal(doc.querySelector('#player-title').textContent, 'Test Movie');
  assert.equal(doc.querySelector('#player-source-count').textContent, '1 source');
  // subtitles are listed in the source panel; clicking one attaches a track
  doc.querySelector('#player-panel-toggle').click();
  await flush();
  const subBtn = doc.querySelector('#player-subs-list .source-item');
  assert.ok(subBtn, 'subtitle listed in panel');
  subBtn.click();
  await flush();
  assert.ok(doc.querySelectorAll('#player-video track').length >= 1);
});

test('tv-series detail lists episodes and episode Play passes the episode number', async () => {
  const { window, fake } = await boot();
  const doc = window.document;
  window.location.hash = `#/detail/fakeprovider/${encodeURIComponent('https://example.com/series')}`;
  await flush();
  const episodeButtons = doc.querySelectorAll('.episode-btn');
  assert.equal(episodeButtons.length, 2);
  episodeButtons[0].click();
  await flush();
  assert.equal(fake.calls.loadLinks, 1);
  assert.equal(fake.calls.lastEpisode, '1');
  assert.equal(doc.querySelector('#player-overlay').hidden, false);
  assert.match(doc.querySelector('#player-subtitle').textContent, /S01E01/);
});

test('extensions tab wiring switches panels without errors', async () => {
  const { window } = await boot();
  const doc = window.document;
  window.location.hash = '#/extensions';
  await flush();
  const discoverTab = doc.querySelector('[data-tab="discover"]');
  discoverTab.click();
  await flush();
  assert.equal(doc.querySelector('#tab-discover').hidden, false);
  assert.equal(doc.querySelector('#tab-installed').hidden, true);
  assert.ok(doc.querySelectorAll('#catalog-chips .catalog-chip').length >= 1);
  const reposTab = doc.querySelector('[data-tab="repos"]');
  reposTab.click();
  await flush();
  assert.equal(doc.querySelector('#tab-repos').hidden, false);
});

test('explore renders TMDB rows and cards route to search', async () => {
  const { window } = await boot();
  const doc = window.document;
  window.location.hash = '#/explore';
  await flush();
  assert.equal(doc.querySelector('#screen-explore').hidden, false);
  assert.equal(doc.querySelector('#explore-key-prompt').hidden, true); // fake api has a key
  const cards = doc.querySelectorAll('#explore-grid .poster-card');
  assert.equal(cards.length, 1);
  assert.match(cards[0].textContent, /Explore Title/);
  cards[0].click();
  await flush();
  assert.match(window.location.hash, /#\/search/);
  assert.equal(doc.querySelector('#search-input').value, 'Explore Title');
});

test('explore prompts for a key when none is configured', async () => {
  const { window, fake } = await boot();
  const doc = window.document;
  const realStatus = fake.api.tmdb.status;
  fake.api.tmdb.status = async () => ({ hasKey: false });
  window.location.hash = '#/explore';
  await flush();
  assert.equal(doc.querySelector('#explore-key-prompt').hidden, false);
  assert.equal(doc.querySelector('#explore-controls').hidden, true);
  assert.equal(doc.querySelectorAll('#explore-grid .poster-card').length, 0);
  fake.api.tmdb.status = realStatus;
});

test('library empty state and settings render', async () => {
  const { window } = await boot();
  const doc = window.document;
  window.location.hash = '#/library';
  await flush();
  assert.equal(doc.querySelector('#library-empty').hidden, false);
  window.location.hash = '#/settings';
  await flush();
  assert.ok(doc.querySelectorAll('#settings-body .settings-card').length >= 4);
  assert.match(doc.querySelector('#settings-body').textContent, /Appearance/);
});
