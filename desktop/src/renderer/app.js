'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   Skystream — renderer application
   Screens: home · search · detail · library · downloads · extensions · settings
   All privileged work flows through window.skystream (see preload.js).
   ═══════════════════════════════════════════════════════════════════════════ */

const api = window.skystream;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
const fmtBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
};
const fmtTime = (totalSeconds) => {
  if (!Number.isFinite(totalSeconds)) return '0:00';
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const fmtDate = (ms) => {
  if (!ms) return '';
  try { return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; }
};

/* ═══════════ global state ═══════════ */
const state = {
  settings: null,
  providers: [],          // bridge providers [{internalName, name, hasMainPage, ...}]
  bridgeOk: false,
  homeLoaded: false,
  searchProviders: new Set(),
  searchQuery: '',
  searchPage: 1,
  searchDone: new Map(),  // provider internalName -> hasNext
  detailCurrent: null,    // { provider, url }
  libraryCache: [],
};

/* ═══════════ settings ═══════════ */
const ACCENTS = ['#38BDF8', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];
const SUBTITLE_COLORS = ['#FFFFFF', '#FBBF24', '#34D399', '#67E8F9'];

async function loadSettings() {
  state.settings = await api.settings.get();
  applySettings(state.settings);
}
function applySettings(s) {
  if (!s) return;
  document.documentElement.dataset.theme = s.theme || 'sky';
  document.documentElement.dataset.reduceMotion = s.reduceMotion ? 'true' : 'false';
  document.documentElement.style.setProperty('--accent', s.accent || '#38BDF8');
  document.documentElement.style.setProperty('--accent-hover', shadeAccent(s.accent || '#38BDF8'));
}
function shadeAccent(hex) {
  // lighten toward white by ~12%
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c, target) => Math.round(c + (target - c) * 0.14);
  const r = mix((n >> 16) & 255, 255); const g = mix((n >> 8) & 255, 255); const b = mix(n & 255, 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}
async function patchSettings(patch) {
  state.settings = await api.settings.set(patch);
  applySettings(state.settings);
  return state.settings;
}

/* ═══════════ toast / modal ═══════════ */
function toast(message, type = 'info', timeout = 4200) {
  const root = $('#toast-root');
  const node = el('div', `toast ${type}`, message);
  root.appendChild(node);
  setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateX(24px)'; setTimeout(() => node.remove(), 300); }, timeout);
}

function openModal(buildContent) {
  const root = $('#modal-root');
  const card = $('#modal-card');
  card.innerHTML = '';
  buildContent(card, closeModal);
  root.hidden = false;
  function onKey(e) { if (e.key === 'Escape') closeModal(); }
  document.addEventListener('keydown', onKey);
  $('#modal-backdrop', root).onclick = closeModal;
  card._cleanup = () => document.removeEventListener('keydown', onKey);
}
function closeModal() {
  const root = $('#modal-root');
  const card = $('#modal-card');
  if (card._cleanup) card._cleanup();
  root.hidden = true;
}
function confirmModal(title, body, confirmLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    openModal((card, close) => {
      card.appendChild(el('h2', null, title));
      const p = el('p', null, body);
      card.appendChild(p);
      const actions = el('div', 'modal-actions');
      const cancel = el('button', 'btn btn-ghost', 'Cancel');
      const confirm = el('button', danger ? 'btn btn-danger' : 'btn btn-accent', confirmLabel);
      cancel.onclick = () => { close(); resolve(false); };
      confirm.onclick = () => { close(); resolve(true); };
      actions.append(cancel, confirm);
      card.appendChild(actions);
    });
  });
}

/* ═══════════ navigation / router ═══════════ */
const routes = ['home', 'explore', 'search', 'detail', 'library', 'downloads', 'extensions', 'settings'];
function navigate(hash) {
  if (location.hash === hash) renderRoute();
  else location.hash = hash;
}
function routeParts() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  return raw.split('/').filter(Boolean);
}
function renderRoute() {
  const parts = routeParts();
  const screen = routes.includes(parts[0]) ? parts[0] : 'home';
  for (const name of routes) {
    const node = $(`#screen-${name}`);
    if (node) node.hidden = name !== screen;
  }
  $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.nav === screen));
  if (screen === 'home') renderHome();
  else if (screen === 'explore') renderExplore();
  else if (screen === 'library') renderLibrary();
  else if (screen === 'downloads') renderDownloads();
  else if (screen === 'extensions') renderExtensions();
  else if (screen === 'settings') renderSettings();
  else if (screen === 'detail') renderDetail(parts[1] || '', decodeURIComponent(parts.slice(2).join('/') || ''));
}
function go(route) { navigate(`#/${route}`); }
function goDetail(provider, item) {
  navigate(`#/detail/${encodeURIComponent(provider)}/${encodeURIComponent(item.url)}`);
}

/* ═══════════ bridge helpers ═══════════ */
async function refreshBridge() {
  const dot = $('#bridge-dot'); const text = $('#bridge-text');
  try {
    const res = await api.bridge.providers();
    state.providers = (res && res.providers) || [];
    state.bridgeOk = true;
    dot.className = 'bridge-dot ok';
    text.textContent = `Bridge · ${state.providers.length} provider${state.providers.length === 1 ? '' : 's'}`;
  } catch (err) {
    state.providers = [];
    state.bridgeOk = false;
    dot.className = 'bridge-dot err';
    text.textContent = 'Bridge offline';
  }
  updateBridgeBar();
  return state.bridgeOk;
}
function updateBridgeBar() {
  const dot = $('#bridge-bar-dot'); const text = $('#bridge-bar-text');
  if (!dot || !text) return;
  if (state.bridgeOk) {
    dot.className = 'bridge-dot ok';
    text.textContent = `Bridge connected — ${state.providers.length} provider${state.providers.length === 1 ? '' : 's'} loaded from ${new Set(state.providers.map((p) => p.internalName)).size} extension(s)`;
  } else {
    dot.className = 'bridge-dot err';
    text.textContent = 'Bridge offline — extension content is unavailable. Check that a JRE is bundled or install Java 21+.';
  }
}
async function mediaUrl(url, headers) {
  if (!url) return '';
  try {
    return await api.mediaUrl(url, headers || undefined);
  } catch {
    return url;
  }
}
function posterUrl(item, sizePx) {
  // Most posters are plain https; only route through the proxy when headers exist.
  const url = item.posterUrl;
  if (!url) return Promise.resolve(null);
  return item.posterHeaders && Object.keys(item.posterHeaders).length
    ? mediaUrl(url, item.posterHeaders)
    : Promise.resolve(url);
}

/* ═══════════ poster cards ═══════════ */
function posterCardNode(item, provider) {
  const card = el('div', 'poster-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', item.name || 'title');
  const fallback = el('div', 'poster-fallback', (item.name || '?').trim().charAt(0).toUpperCase());
  card.appendChild(fallback);
  posterUrl(item).then((src) => {
    if (!src) return;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = item.name || '';
    img.src = src;
    img.onerror = () => img.remove();
    img.onload = () => { fallback.hidden = true; };
    card.appendChild(img);
  });
  const meta = el('div', 'poster-meta');
  if (item.type) meta.appendChild(el('div', 'poster-type', String(item.type)));
  meta.appendChild(el('div', null, item.name || 'Untitled'));
  card.appendChild(meta);
  card.addEventListener('click', () => goDetail(provider, item));
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goDetail(provider, item); } });
  return card;
}



async function continueWatchingEntries() {
  const library = await api.library.list();
  state.libraryCache = library;
  const entries = [];
  for (const entry of library) {
    const progress = await api.progress.get(entry.key);
    if (progress && progress.positionMs > 30000 && (!progress.durationMs || progress.positionMs / progress.durationMs < 0.95)) {
      entries.push({ entry, progress });
    }
  }
  return entries;
}

async function renderContinueBlock(container, { onEmpty } = {}) {
  container.innerHTML = '';
  const entries = await continueWatchingEntries();
  if (!entries.length) { container.hidden = true; if (onEmpty) onEmpty(); return; }
  container.hidden = false;
  const title = el('div', 'section-row-title', 'Continue watching');
  title.style.marginBottom = '10px';
  container.appendChild(title);
  const row = el('div', 'continue-grid');
  for (const { entry, progress } of entries) {
    const card = posterCardNode({ name: entry.name, url: entry.url, posterUrl: entry.posterUrl, type: entry.type }, entry.provider);
    if (progress.durationMs > 0) {
      const strip = el('div', 'progress-strip');
      const fill = el('div');
      fill.style.width = `${Math.min(100, (progress.positionMs / progress.durationMs) * 100)}%`;
      strip.appendChild(fill);
      card.appendChild(strip);
    }
    row.appendChild(card);
  }
  container.appendChild(row);
}

/* ═══════════ HOME screen ═══════════ */
async function renderHome() {
  const body = $('#home-body');
  const empty = $('#home-empty');
  const offline = $('#home-offline');
  body.innerHTML = '';
  await refreshBridge();
  await renderContinueBlock($('#home-continue'));

  const providers = state.providers.filter((p) => p.hasMainPage);
  const internalNames = new Set(state.providers.map((p) => p.internalName));
  $('#home-sub').textContent = state.bridgeOk
    ? (providers.length ? `Latest from ${internalNames.size} extension${internalNames.size === 1 ? '' : 's'}` : 'No provider on this device has a home page')
    : 'The extension bridge is offline';

  offline.hidden = state.bridgeOk;

  if (!state.bridgeOk || providers.length === 0) {
    empty.hidden = !(state.bridgeOk && internalNames.size === 0);
    if (state.bridgeOk && providers.length === 0 && internalNames.size > 0) {
      body.innerHTML = '<div class="loading-line">Your providers don’t expose a homepage — try Search instead.</div>';
      return;
    }
    if (!state.bridgeOk) {
      empty.hidden = true;
    }
    return;
  }
  empty.hidden = true;

  // Skeleton rows while loading
  for (let i = 0; i < 2; i += 1) {
    const skeletonSection = el('div', 'section-row');
    skeletonSection.appendChild(el('div', 'skeleton', ''));
    skeletonSection.firstChild.style.cssText = 'height: 300px; aspect-ratio: auto;';
    body.appendChild(skeletonSection);
  }

  for (const provider of providers) {
    try {
      const res = await api.bridge.home(provider.internalName, 1);
      const lists = (res && res.lists) || [];
      renderHomeSections(body, provider, lists);
    } catch (err) {
      const row = el('div', 'section-row');
      const head = el('div', 'section-row-head');
      head.appendChild(el('div', 'section-row-title', provider.name));
      const errNode = el('span', 'row-error', `Failed: ${err.message || err}`);
      head.appendChild(errNode);
      row.appendChild(head);
      body.appendChild(row);
    }
  }
  $$('.skeleton', body).forEach((n) => n.remove());
  state.homeLoaded = true;
}

function renderHomeSections(body, provider, lists) {
  for (const list of lists) {
    if (list.error) {
      const row = el('div', 'section-row');
      const head = el('div', 'section-row-head');
      head.appendChild(el('div', 'section-row-title', `${list.name || 'Section'} · ${provider.name}`));
      head.appendChild(el('span', 'row-error', list.error));
      row.appendChild(head);
      body.appendChild(row);
      continue;
    }
    const rows = list.rows || (list.items ? [{ name: list.name, items: list.items }] : []);
    for (const sub of rows) {
      const items = sub.items || [];
      if (!items.length) continue;
      const row = el('div', 'section-row');
      const head = el('div', 'section-row-head');
      const title = el('div', 'section-row-title');
      title.appendChild(document.createTextNode(sub.name || list.name || provider.name));
      title.appendChild(el('span', 'provider-tag', provider.name));
      head.appendChild(title);
      row.appendChild(head);
      const strip = el('div', 'posters');
      for (const item of items) strip.appendChild(posterCardNode(item, provider.internalName));
      row.appendChild(strip);
      body.appendChild(row);
    }
  }
}

/* ═══════════ EXPLORE screen (TMDB) ═══════════ */
const exploreState = { mediaType: 'movie', section: 'trending', page: 1, totalPages: 1, loading: false, hasKey: false };

function exploreCardNode(item) {
  const card = el('div', 'poster-card explore-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', item.name || 'title');
  const fallback = el('div', 'poster-fallback', (item.name || '?').trim().charAt(0).toUpperCase());
  card.appendChild(fallback);
  if (item.posterUrl) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = item.name || '';
    img.src = item.posterUrl;
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.remove();
    img.onload = () => { fallback.hidden = true; };
    card.appendChild(img);
  }
  const meta = el('div', 'poster-meta');
  meta.appendChild(el('div', 'poster-type', item.mediaType === 'tv' ? 'series' : 'movie'));
  meta.appendChild(el('div', null, item.name || 'Untitled'));
  const bits = [];
  if (item.year) bits.push(item.year);
  if (item.rating != null && item.rating > 0) bits.push(`★ ${item.rating}`);
  if (bits.length) meta.appendChild(el('div', 'explore-sub', bits.join('  ·  ')));
  card.appendChild(meta);
  const play = () => explorePlay(item);
  card.addEventListener('click', play);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
  return card;
}

function explorePlay(item) {
  searchInput.value = item.name || '';
  $('#search-clear').hidden = !searchInput.value;
  go('search');
  runSearch(true);
}

async function renderExplore(reset = true) {
  if (reset) { exploreState.page = 1; exploreState.totalPages = 1; }
  // Re-check the key every time the screen renders (the user may have just added one in Settings).
  try {
    const s = await api.tmdb.status();
    exploreState.hasKey = !!(s && s.hasKey);
  } catch {
    exploreState.hasKey = false;
  }
  const prompt = $('#explore-key-prompt');
  const controls = $('#explore-controls');
  const grid = $('#explore-grid');
  const status = $('#explore-status');
  const more = $('#explore-more');
  $('#explore-legal').hidden = !exploreState.hasKey;
  prompt.hidden = exploreState.hasKey;
  controls.hidden = !exploreState.hasKey;
  if (!exploreState.hasKey) {
    grid.innerHTML = '';
    status.hidden = true;
    more.hidden = true;
    return;
  }
  if (exploreState.loading) return;
  exploreState.loading = true;
  status.hidden = false;
  status.textContent = reset ? 'Loading…' : 'Loading more…';
  try {
    const res = await api.tmdb.list({ mediaType: exploreState.mediaType, section: exploreState.section, page: exploreState.page });
    exploreState.totalPages = res.totalPages || 1;
    if (reset) grid.innerHTML = '';
    for (const item of res.items || []) grid.appendChild(exploreCardNode(item));
    status.hidden = true;
    more.hidden = exploreState.page >= exploreState.totalPages;
  } catch (err) {
    status.hidden = false;
    status.textContent = (err && err.message) || 'Explore failed to load.';
    more.hidden = true;
  } finally {
    exploreState.loading = false;
  }
}

$('#explore-key-cta').addEventListener('click', () => go('settings'));
$('#explore-more').addEventListener('click', async () => {
  if (exploreState.loading || exploreState.page >= exploreState.totalPages) return;
  exploreState.page += 1;
  await renderExplore(false);
});
$('#explore-attribution').addEventListener('click', (e) => {
  e.preventDefault();
  api.openExternal('https://www.themoviedb.org');
});
for (const btn of $$('#explore-media button')) {
  btn.addEventListener('click', () => {
    if (exploreState.mediaType === btn.dataset.mt) return;
    exploreState.mediaType = btn.dataset.mt;
    $$('#explore-media button').forEach((b) => b.classList.toggle('active', b === btn));
    renderExplore(true);
  });
}
for (const btn of $$('#explore-section button')) {
  btn.addEventListener('click', () => {
    if (exploreState.section === btn.dataset.section) return;
    exploreState.section = btn.dataset.section;
    $$('#explore-section button').forEach((b) => b.classList.toggle('active', b === btn));
    renderExplore(true);
  });
}

/* ═══════════ SEARCH screen ═══════════ */
function scopeKey() { return 'skystream.search.scope'; }
function loadScope() {
  try {
    const raw = localStorage.getItem(scopeKey());
    return raw === null ? null : new Set(JSON.parse(raw));
  } catch { return null; }
}
function saveScope(set) {
  try { localStorage.setItem(scopeKey(), JSON.stringify([...set])); } catch { /* ignore */ }
}

async function renderSearchScope() {
  const wrap = $('#search-scope');
  wrap.innerHTML = '';
  const all = state.providers;
  if (!all.length) return;
  const stored = loadScope(); // null = never stored → default to all providers
  const effective = stored ? stored : new Set(all.map((p) => p.internalName));
  state.searchProviders = new Set(effective);
  const allOn = all.length > 0 && all.every((p) => effective.has(p.internalName));
  const allChip = el('button', `chip${allOn ? ' on' : ''}`, 'All providers');
  allChip.onclick = () => {
    const next = new Set(allOn ? [] : all.map((p) => p.internalName));
    state.searchProviders = next;
    saveScope(next);
    renderSearchScope();
  };
  wrap.appendChild(allChip);
  for (const p of all) {
    const on = effective.has(p.internalName);
    const chip = el('button', `chip${on ? ' on' : ''}`, p.name);
    chip.title = p.internalName;
    chip.onclick = () => {
      const next = new Set(state.searchProviders);
      if (next.has(p.internalName)) next.delete(p.internalName); else next.add(p.internalName);
      state.searchProviders = next;
      saveScope(next);
      renderSearchScope();
    };
    wrap.appendChild(chip);
  }
}

const searchInput = $('#search-input');
const searchMeta = $('#search-meta');
const resultsGrid = $('#search-results');

async function renderHistory() {
  const wrap = $('#search-history');
  wrap.innerHTML = '';
  const items = await api.history.list();
  if (!items.length) return;
  for (const item of items.slice(0, 10)) {
    const chip = el('span', 'history-chip');
    chip.appendChild(document.createTextNode(item));
    const remove = el('button', null, '×');
    remove.title = 'Remove from history';
    remove.onclick = async (ev) => { ev.stopPropagation(); const next = (await api.history.list()).filter((x) => x !== item); await api.history.clear(); for (const q of next.reverse()) await api.history.add(q); renderHistory(); };
    chip.appendChild(remove);
    chip.onclick = () => { searchInput.value = item; runSearch(true); };
    wrap.appendChild(chip);
  }
}

async function runSearch(reset) {
  const query = searchInput.value.trim();
  $('#search-clear').hidden = !query;
  if (!query) { resultsGrid.innerHTML = ''; searchMeta.textContent = ''; $('#search-more').hidden = true; $('#search-history').hidden = false; renderHistory(); return; }
  $('#search-history').hidden = true;

  if (reset) {
    state.searchQuery = query;
    state.searchPage = 1;
    state.searchDone.clear();
    resultsGrid.innerHTML = '';
    await api.history.add(query);
  }

  const targets = state.providers.filter((p) => state.searchProviders.has(p.internalName));
  if (!targets.length) {
    searchMeta.textContent = 'No providers selected — enable some above.';
    resultsGrid.innerHTML = '';
    return;
  }

  let resolved = 0; let total = 0; let errors = 0;
  let appendedAny = !reset;

  const hasNextByProvider = new Map();
  await Promise.all(targets.map(async (provider) => {
    try {
      const res = await api.bridge.search(query, provider.internalName, state.searchPage);
      const items = (res && res.items) || [];
      hasNextByProvider.set(provider.internalName, !!(res && res.hasNext));
      total += items.length;
      for (const item of items) {
        resultsGrid.appendChild(posterCardNode(item, provider.internalName));
        appendedAny = true;
      }
    } catch (err) {
      errors += 1;
      console.warn('search failed for', provider.internalName, err);
    } finally {
      resolved += 1;
      searchMeta.textContent = `${resolved}/${targets.length} providers responded…`;
    }
  }));
  state.searchDone = hasNextByProvider;

  if (!appendedAny && resultsGrid.children.length === 0) {
    resultsGrid.innerHTML = '';
    searchMeta.textContent = errors === targets.length
      ? 'All providers failed — the bridge may be offline or the extensions broken.'
      : 'No results.';
  } else {
    searchMeta.textContent = `${total} result${total === 1 ? '' : 's'} from ${targets.length} provider${targets.length === 1 ? '' : 's'}${errors ? ` · ${errors} failed` : ''}`;
  }
  const anyNext = [...hasNextByProvider.values()].some(Boolean);
  $('#search-more').hidden = !anyNext;
}

$('#search-go').addEventListener('click', () => runSearch(true));
$('#search-more').addEventListener('click', async () => {
  state.searchPage += 1;
  await runSearch(false);
});
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(true); });
searchInput.addEventListener('input', debounce(() => { $('#search-clear').hidden = !searchInput.value; }, 150));
$('#search-clear').addEventListener('click', () => { searchInput.value = ''; runSearch(true); searchInput.focus(); });

/* ═══════════ DETAIL screen ═══════════ */
const detailScreen = $('#screen-detail');


async function renderDetail(provider, url) {
  $('#screen-detail').hidden = false;
  detailScreen.innerHTML = '<div class="loading-line"><div class="spinner"></div> Loading…</div>';
  if (!provider || !url) { detailScreen.innerHTML = '<div class="loading-line">Missing provider/url.</div>'; return; }
  state.detailCurrent = { provider, url };

  let d;
  try {
    d = await api.bridge.load(provider, url);
  } catch (err) {
    detailScreen.innerHTML = '';
    const wrap = el('div', 'empty-state');
    wrap.appendChild(el('h2', null, 'Couldn’t load this title'));
    wrap.appendChild(el('p', null, String(err.message || err)));
    const back = el('button', 'btn btn-ghost', 'Go back');
    back.onclick = () => history.back();
    wrap.appendChild(back);
    detailScreen.appendChild(wrap);
    return;
  }
  if (!d) { detailScreen.innerHTML = '<div class="loading-line">No data returned.</div>'; return; }

  const poster = d.posterUrl;
  const backdrop = d.backgroundPosterUrl || d.posterUrl;
  const [posterSrc, backdropSrc] = await Promise.all([
    posterUrl(d),
    posterUrl({ posterUrl: backdrop, posterHeaders: d.posterHeaders }),
  ]);

  detailScreen.innerHTML = '';
  const hero = el('div', 'detail-hero');
  const backdropDiv = el('div', 'detail-backdrop');
  if (backdropSrc) backdropDiv.style.backgroundImage = `url("${backdropSrc.replace(/"/g, '%22')}")`;
  hero.appendChild(backdropDiv);

  const inner = el('div', 'detail-inner');
  if (posterSrc) {
    const img = document.createElement('img');
    img.className = 'detail-poster';
    img.src = posterSrc;
    img.alt = d.name || '';
    inner.appendChild(img);
  }
  const info = el('div', 'detail-info');
  const kicker = el('div', 'detail-kicker');
  if (d.type) kicker.appendChild(el('span', 'badge', String(d.type)));
  kicker.appendChild(el('span', 'badge ghost', provider));
  info.appendChild(kicker);
  info.appendChild(el('h1', 'detail-title', d.name || 'Untitled'));

  const meta = el('div', 'detail-meta');
  if (d.year) meta.appendChild(el('span', null, String(d.year)));
  if (d.duration) meta.appendChild(el('span', null, `${d.duration} min`));
  if (d.contentRating) meta.appendChild(el('span', null, String(d.contentRating)));
  if (d.score != null) {
    const score = el('span', 'score-badge');
    score.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.2 5.9 20.5l1.5-6.8L2.2 9l6.9-.7z"/></svg> ${Number(d.score).toFixed(1)}`;
    meta.appendChild(score);
  }
  info.appendChild(meta);
  if (d.plot) info.appendChild(el('p', 'detail-plot', d.plot));
  if (Array.isArray(d.tags) && d.tags.length) {
    const tags = el('div', 'detail-tags');
    for (const tag of d.tags.slice(0, 10)) tags.appendChild(el('span', 'tag', String(tag)));
    info.appendChild(tags);
  }

  const actions = el('div', 'detail-actions');
  const kind = d.kind || 'unknown';
  const isEpisodeBased = kind === 'anime' || kind === 'tvseries';
  const playBtn = el('button', 'btn btn-accent', 'Play');
  playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg> Play';
  playBtn.onclick = () => playDetail(d, provider, url, playBtn);
  actions.appendChild(playBtn);

  const libraryKey = `${provider}:${url}`;
  const libraryBtn = el('button', 'btn btn-ghost', 'Add to library');
  const syncLibraryBtn = async () => {
    const entry = (await api.library.list()).find((e) => e.key === libraryKey);
    libraryBtn.textContent = entry ? 'In library' : 'Add to library';
    libraryBtn.classList.toggle('btn-accent', !!entry);
    libraryBtn.classList.toggle('btn-ghost', !entry);
  };
  await syncLibraryBtn();
  libraryBtn.onclick = async () => {
    const entry = (await api.library.list()).find((e) => e.key === libraryKey);
    if (entry) {
      await api.library.remove(libraryKey);
      toast('Removed from library');
    } else {
      await api.library.upsert({ key: libraryKey, provider, url, name: d.name, posterUrl: d.posterUrl, type: d.type });
      toast('Added to library', 'success');
    }
    syncLibraryBtn();
  };
  actions.appendChild(libraryBtn);

  const downloadBtn = el('button', 'btn btn-ghost', 'Download');
  downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 4v10M8.5 10.5 12 14l3.5-3.5M6 17h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  downloadBtn.title = 'Download a stream';
  downloadBtn.onclick = () => downloadDetail(d, provider, url, downloadBtn);
  actions.appendChild(downloadBtn);
  info.appendChild(actions);
  inner.appendChild(info);
  hero.appendChild(inner);
  detailScreen.appendChild(hero);

  const bodyWrap = el('div', 'detail-body');

  // ── episodes ──────────────────────────────────────────────────────────────
  if (isEpisodeBased) {
    const epSection = el('div', 'detail-section');
    const epTitle = el('div', 'detail-section-title');
    epTitle.appendChild(el('span', null, 'Episodes'));
    epSection.appendChild(epTitle);
    renderEpisodeSection(epSection, d, provider, url);
    bodyWrap.appendChild(epSection);
  }

  // ── cast ─────────────────────────────────────────────────────────────────
  const actors = Array.isArray(d.actors) ? d.actors : [];
  if (actors.length) {
    const sec = el('div', 'detail-section');
    sec.appendChild(el('div', 'detail-section-title', 'Cast'));
    const row = el('div', 'actor-row');
    for (const a of actors.slice(0, 24)) {
      const node = el('div', 'actor');
      if (a.image) {
        const img = document.createElement('img');
        img.src = a.image; img.alt = a.name || ''; img.loading = 'lazy';
        img.onerror = () => { img.replaceWith(actorFallback(a.name)); };
        node.appendChild(img);
      } else {
        node.appendChild(actorFallback(a.name));
      }
      node.appendChild(el('span', null, a.name || 'Unknown'));
      row.appendChild(node);
    }
    sec.appendChild(row);
    bodyWrap.appendChild(sec);
  }

  // ── recommendations ───────────────────────────────────────────────────────
  const recs = Array.isArray(d.recommendations) ? d.recommendations : [];
  if (recs.length) {
    const sec = el('div', 'detail-section');
    sec.appendChild(el('div', 'detail-section-title', 'More like this'));
    const strip = el('div', 'posters');
    for (const item of recs.slice(0, 20)) strip.appendChild(posterCardNode(item, provider));
    sec.appendChild(strip);
    bodyWrap.appendChild(sec);
  }

  detailScreen.appendChild(bodyWrap);
}

function actorFallback(name) {
  return el('div', 'actor-fallback', (name || '?').trim().charAt(0).toUpperCase());
}

function flattenEpisodes(d) {
  const episodes = d.episodes || {};
  const groups = [];
  for (const [status, list] of Object.entries(episodes)) {
    if (Array.isArray(list) && list.length) groups.push({ status, episodes: list });
  }
  for (const group of groups) {
    group.episodes = [...group.episodes].sort((a, b) =>
      ((a.season ?? 1) - (b.season ?? 1)) || ((a.episode ?? 0) - (b.episode ?? 0)));
    group.seasons = [...new Set(group.episodes.map((e) => e.season ?? 1))].sort((a, b) => a - b);
  }
  return groups;
}

function episodeProgressKey(provider, url, ep) {
  return `${provider}:${url}::${ep.season ?? 1}::${ep.episode ?? 0}`;
}

function renderEpisodeSection(container, d, provider, url) {
  const groups = flattenEpisodes(d);
  if (!groups.length) {
    container.appendChild(el('div', 'loading-line', 'No episodes listed.'));
    return;
  }
  let activeGroup = 0;
  let activeSeason = groups[0].seasons[groups[0].seasons.length - 1];

  const tabs = el('div', 'episode-tabs');
  const seasonRow = el('div', 'season-row');
  seasonRow.appendChild(el('label', null, 'Season'));
  const seasonSelect = document.createElement('select');
  seasonSelect.className = 'select';
  seasonRow.appendChild(seasonSelect);
  const grid = el('div', 'episode-grid');
  container.append(tabs, seasonRow, grid);

  const showGroup = async (index) => {
    activeGroup = index;
    $$('.episode-tab', tabs).forEach((t, i) => t.classList.toggle('active', i === index));
    const group = groups[index];
    activeSeason = group.seasons[group.seasons.length - 1];
    seasonSelect.innerHTML = '';
    for (const season of group.seasons) {
      const opt = document.createElement('option');
      opt.value = String(season);
      opt.textContent = `Season ${season}`;
      seasonSelect.appendChild(opt);
    }
    seasonSelect.value = String(activeSeason);
    await showSeason(group, activeSeason);
  };

  const showSeason = async (group, season) => {
    grid.innerHTML = '';
    const list = group.episodes.filter((e) => (e.season ?? 1) === Number(season));
    for (const ep of list) {
      const btn = el('button', 'episode-btn', ep.episode != null ? String(ep.episode) : '–');
      btn.title = ep.name || `Episode ${ep.episode ?? ''}`;
      api.progress.get(episodeProgressKey(provider, url, ep)).then((p) => {
        if (p && p.positionMs > 30000) btn.classList.add('watched');
      });
      btn.onclick = () => playEpisode(provider, url, d, ep, btn);
      grid.appendChild(btn);
    }
  };

  if (groups.length > 1) {
    groups.forEach((group, i) => {
      const tab = el('button', 'episode-tab', group.status === 'None' ? 'Episodes' : group.status);
      tab.onclick = () => showGroup(i);
      tabs.appendChild(tab);
    });
  } else {
    tabs.hidden = true;
  }
  seasonSelect.onchange = () => showSeason(groups[activeGroup], seasonSelect.value);
  showGroup(0);
}

function episodeSummary(ep) {
  const season = ep?.season ?? 1;
  const number = ep?.episode ?? 0;
  return `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}`;
}

/* ═══════════ playback ═══════════ */
const player = {
  hls: null,
  dash: null,
  provider: null,
  detailUrl: null,
  data: null,
  episode: null,
  episodeList: [],
  links: [],
  subtitles: [],
  current: null,
  title: '',
  progressKey: null,
  hideTimer: null,
  lastSave: 0,
  inLibrary: false,
  skipSegments: [],
  skippedSkipSegments: new Set(),
  activeSkipSegment: null,
};
const video = $('#player-video');

function playerHeaders(link) {
  const headers = Object.assign({}, link.headers || {});
  const hasReferer = Object.keys(headers).some((k) => k.toLowerCase() === 'referer');
  if (link.referer && !hasReferer) headers['Referer'] = link.referer;
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent')) {
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  }
  return headers;
}

function bestLink(links, preference) {
  if (!Array.isArray(links) || !links.length) return null;
  const score = (l) => (Number.isFinite(l.quality) ? l.quality : 0);
  const sorted = [...links].sort((a, b) => score(b) - score(a));
  if (preference === 'lowest') return sorted[sorted.length - 1];
  return sorted[0]; // auto / highest
}

async function playDetail(d, provider, url, button) {
  const kind = d.kind || 'unknown';
  if (kind === 'anime' || kind === 'tvseries') {
    const groups = flattenEpisodes(d);
    const all = groups.flatMap((g) => g.episodes);
    if (!all.length) { toast('No episodes listed for this title.', 'error'); return; }
    const saved = await api.progress.get(`${provider}:${url}`);
    let target = null;
    for (const ep of all) {
      const p = await api.progress.get(episodeProgressKey(provider, url, ep));
      if (p && p.positionMs > 30000 && (!p.durationMs || p.positionMs / p.durationMs < 0.95)) { target = ep; break; }
    }
    if (!target && saved && saved.recentEpisodeData) {
      target = all.find((e) => e.data === saved.recentEpisodeData) || all[0];
    }
    if (!target) target = all[0];
    await playEpisode(provider, url, d, target, button);
    return;
  }
  const data = kind === 'torrent' ? (d.magnet || d.torrent) : d.dataUrl;
  if (!data) { toast('This title has no playable data yet.', 'error'); return; }
  await startPlayback({ provider, detailUrl: url, data, episode: null, title: d.name, subtitle: d.type || '', entry: d, button });
}

async function playEpisode(provider, url, d, ep, button) {
  const groups = flattenEpisodes(d);
  const flat = groups.flatMap((g) => g.episodes);
  await startPlayback({
    provider, detailUrl: url, data: ep.data, episode: ep,
    title: d.name || 'Episode', subtitle: `${episodeSummary(ep)}${ep.name ? ` · ${ep.name}` : ''}`,
    entry: d, button, episodeList: flat,
  });
}

async function startPlayback({ provider, detailUrl, data, episode, title, subtitle, entry, button, episodeList }) {
  if (button) { button.disabled = true; }
  toast('Resolving stream…', 'info', 2500);
  try {
    const res = await api.bridge.loadLinks(provider, data, episode && episode.episode != null ? String(episode.episode) : null);
    const links = (res && res.links) || [];
    const subtitles = (res && res.subtitles) || [];
    if (!links.length) {
      toast('No playable streams found. Try another source.', 'error');
      return;
    }
    openPlayer({ provider, detailUrl, data, episode, title, subtitle, entry, links, subtitles, episodeList });
    // Remember resume info on the library entry for "continue watching".
    await api.library.upsert({
      key: `${provider}:${detailUrl}`, provider, url: detailUrl, name: title,
      posterUrl: entry?.posterUrl || null, type: entry?.type || null,
    });
  } catch (err) {
    toast(`Stream resolution failed: ${err.message || err}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function openPlayer({ provider, detailUrl, data, episode, title, subtitle, entry, links, subtitles, episodeList }) {
  player.provider = provider;
  player.detailUrl = detailUrl;
  player.data = data;
  player.episode = episode || null;
  player.episodeList = episodeList || [];
  player.skipSegments = [];
  player.skippedSkipSegments = new Set();
  player.activeSkipSegment = null;
  $('#pc-skip').hidden = true;
  player.links = links;
  player.subtitles = subtitles;
  player.title = title || '';
  player.subtitle = subtitle || '';
  player.progressKey = episode
    ? `${provider}:${detailUrl}::${episode.season ?? 1}::${episode.episode ?? 0}`
    : `${provider}:${detailUrl}`;
  $('#player-title').textContent = player.title;
  $('#player-subtitle').textContent = player.subtitle;
  $('#player-overlay').hidden = false;
  $('#player-panel').hidden = true;
  $('#player-source-count').textContent = `${links.length} source${links.length === 1 ? '' : 's'}`;
  $('#player-panel-toggle').hidden = false;
  $('#pc-engine').textContent = 'Resolving…';
  renderPlayerSources();
  attachSource(bestLink(links, state.settings?.defaultQuality));
  refreshLibraryButton();
  loadSkipSegments();
  pokeHud();
}

/* ═══════════ skip segments (IntroDB / AniSkip via main process) ═══════════ */
function skipTypeLabel(type) {
  if (type === 'intro') return 'intro';
  if (type === 'outro') return 'outro';
  if (type === 'recap') return 'recap';
  return 'segment';
}

function loadSkipSegments() {
  const settings = state.settings || {};
  if (!settings.skipIntroOutro || !player.episode) return;
  const season = player.episode.season ?? 1;
  const number = player.episode.episode ?? 1;
  const fetchSegments = async () => {
    try {
      const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
      const segments = await api.skip.segments({ title: player.title, season, episode: number, durationSec });
      // Guard against a stale response landing after the user closed the player or moved to another title.
      if (!$('#player-overlay').hidden && player.progressKey) {
        player.skipSegments = Array.isArray(segments) ? segments : [];
      }
    } catch {
      player.skipSegments = [];
    }
  };
  if (Number.isFinite(video.duration) && video.duration > 0) fetchSegments();
  else video.addEventListener('loadedmetadata', fetchSegments, { once: true });
}

function updateSkipUi() {
  const btn = $('#pc-skip');
  const segments = player.skipSegments;
  if (!segments.length) { btn.hidden = true; player.activeSkipSegment = null; return; }
  const t = video.currentTime;
  let seg = null;
  for (const s of segments) {
    if (t >= s.start && t < s.end) { seg = s; break; }
  }
  if (!seg || player.skippedSkipSegments.has(seg.start)) { btn.hidden = true; player.activeSkipSegment = null; return; }
  player.activeSkipSegment = seg;
  const label = skipTypeLabel(seg.type);
  if (state.settings?.skipAuto) {
    player.skippedSkipSegments.add(seg.start);
    video.currentTime = seg.end;
    btn.hidden = true;
    toast(`Skipped ${label}`, 'info', 1800);
    return;
  }
  btn.textContent = `Skip ${label}`;
  btn.hidden = false;
}

function scrobbleCurrent() {
  const s = state.settings || {};
  if (!s.traktClientId || !s.traktClientSecret) return;
  const ep = player.episode;
  api.trakt.scrobble({ title: player.title, season: ep ? ep.season ?? 1 : undefined, episode: ep ? ep.episode ?? undefined : undefined })
    .then((res) => {
      if (res && res.scrobbled) toast(`Scrobbled to Trakt · ${(res.resolved && res.resolved.name) || player.title}`, 'success', 2600);
    })
    .catch(() => { /* best effort — never disturb playback */ });
}

function currentSubtitles() { return player.subtitles || []; }

function renderPlayerSources() {
  const list = $('#player-sources-list');
  list.innerHTML = '';
  (player.links || []).forEach((link, i) => {
    const btn = el('button', `source-item${player.current === link ? ' active' : ''}`);
    const kind = link.isM3u8 ? 'HLS' : link.isDash ? 'DASH' : (link.type || 'VIDEO');
    btn.innerHTML = `<span class="link-kind ${link.isM3u8 ? 'm3u8' : ''}">${escapeHtml(String(kind))}</span>`
      + `<span style="min-width:0"><strong>${escapeHtml(link.name || `Source ${i + 1}`)}</strong><small>${escapeHtml(link.source || '')}${link.quality ? ` · ${link.quality}p` : ''}</small></span>`;
    btn.onclick = () => attachSource(link);
    list.appendChild(btn);
  });
  const subList = $('#player-subs-list');
  subList.innerHTML = '';
  const subs = currentSubtitles();
  $('#player-subs-head').hidden = subs.length === 0;
  for (const sub of subs) {
    const btn = el('button', 'source-item');
    btn.innerHTML = `<span class="link-kind">CC</span><span style="min-width:0"><strong>${escapeHtml(sub.lang || 'Subtitle')}</strong><small>${escapeHtml(sub.url || '')}</small></span>`;
    btn.onclick = () => attachSubtitle(sub);
    subList.appendChild(btn);
  }
}

async function attachSubtitle(sub) {
  const url = sub.url || '';
  if (!/\.vtt(\?|$)/i.test(url)) {
    toast('Only WebVTT subtitles can be rendered in-app — opening externally.', 'info');
    api.openExternal(url);
    return;
  }
  const src = await mediaUrl(url, sub.headers || undefined);
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = sub.lang || 'Subtitle';
  track.srclang = String(sub.lang || 'und').split(',')[0].slice(0, 5);
  track.src = src;
  track.default = true;
  video.appendChild(track);
  const textTrack = video.textTracks[video.textTracks.length - 1];
  if (textTrack) textTrack.mode = 'showing';
  toast('Subtitle track added', 'success');
}

async function attachSource(link) {
  if (!link) return;
  player.current = link;
  const v = video;
  if (player.hls) { player.hls.destroy(); player.hls = null; }
  if (player.dash) { try { player.dash.destroy(); } catch { /* ignore */ } player.dash = null; }
  $$('track', v).forEach((t) => t.remove());
  v.removeAttribute('src');
  v.load();

  const headers = playerHeaders(link);
  const src = await mediaUrl(link.url, headers);
  const isM3u8 = link.isM3u8 || /\.m3u8(\?|$)/i.test(link.url);
  const isDash = link.isDash || /\.mpd(\?|$)/i.test(link.url);
  let engine = 'native';
  if (isM3u8 && window.Hls && Hls.isSupported()) {
    engine = 'hls.js';
    player.hls = new Hls({ maxBufferLength: 30, backBufferLength: 60 });
    player.hls.loadSource(src);
    player.hls.attachMedia(v);
    player.hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (data && data.fatal) toast(`Playback error (${data.details || 'fatal'}) — try another source`, 'error');
    });
  } else if (isDash && window.dashjs) {
    engine = 'dash.js';
    player.dash = window.dashjs.MediaPlayer().create();
    player.dash.initialize(v, src, true);
  } else {
    v.src = src;
  }
  $('#pc-engine').textContent = engine;

  const saved = state.settings?.rememberPosition === false
    ? null
    : await api.progress.get(player.progressKey);
  const resume = saved && saved.positionMs > 20000 ? saved.positionMs / 1000 : 0;
  if (resume > 0 || (state.settings?.skipIntroSeconds > 0 && player.episode)) {
    const kick = () => {
      v.currentTime = resume > 0 ? resume : state.settings.skipIntroSeconds;
      v.removeEventListener('loadedmetadata', kick);
    };
    v.addEventListener('loadedmetadata', kick);
  }
  renderPlayerSources();
  v.play().catch(() => { /* autoplay may need a gesture; user can press play */ });
}

async function closePlayer() {
  if (!$('#player-overlay').hidden) {
    saveProgressNow();
    await video.pause();
    if (player.hls) { player.hls.destroy(); player.hls = null; }
    if (player.dash) { try { player.dash.destroy(); } catch { /* ignore */ } player.dash = null; }
    video.removeAttribute('src');
    video.load();
    $('#player-overlay').hidden = true;
    $('#pc-skip').hidden = true;
    player.skipSegments = [];
    player.activeSkipSegment = null;
    document.exitFullscreen?.().catch(() => {});
  }
}

function saveProgressNow() {
  if (!player.progressKey || !Number.isFinite(video.duration)) return;
  const positionMs = Math.floor(video.currentTime * 1000);
  const durationMs = Math.floor(video.duration * 1000);
  if (positionMs > 10000) api.progress.set(player.progressKey, positionMs, durationMs);
}

function setPlayIcon(isPlaying) {
  $('.ic-play', $('#pc-play')).hidden = isPlaying;
  $('.ic-pause', $('#pc-play')).hidden = !isPlaying;
}

function pokeHud() {
  const overlay = $('#player-overlay');
  overlay.classList.remove('hud-hidden');
  clearTimeout(player.hideTimer);
  if (!video.paused) {
    player.hideTimer = setTimeout(() => overlay.classList.add('hud-hidden'), 3200);
  }
}

/* player control wiring */
const overlay = $('#player-overlay');
overlay.addEventListener('mousemove', pokeHud);
overlay.addEventListener('click', (e) => { if (e.target === overlay) { togglePlay(); } });
$('#player-back').addEventListener('click', closePlayer);
$('#pc-fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else overlay.requestFullscreen?.();
});
const SPEED_STEPS = [1, 1.25, 1.5, 2, 0.5];
let speedIndex = 0;
$('#pc-speed').addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % SPEED_STEPS.length;
  video.playbackRate = SPEED_STEPS[speedIndex];
  $('#pc-speed').textContent = `${SPEED_STEPS[speedIndex]}×`;
});
$('#pc-download').addEventListener('click', () => {
  if (!player.current) { toast('Nothing playing.', 'info'); return; }
  const label = `${player.title}${player.episode ? ` ${episodeSummary(player.episode)}` : ''}`;
  queueDownload(player.current, label, player.provider, null);
});
$('#pc-skip').addEventListener('click', () => {
  const seg = player.activeSkipSegment;
  if (!seg) return;
  player.skippedSkipSegments.add(seg.start);
  video.currentTime = seg.end;
  $('#pc-skip').hidden = true;
});

$('#player-panel-toggle').addEventListener('click', () => { $('#player-panel').hidden = !$('#player-panel').hidden; });
$('#pc-play').addEventListener('click', togglePlay);
function togglePlay() { if (video.paused) video.play(); else video.pause(); }

video.addEventListener('play', () => { setPlayIcon(true); pokeHud(); });
video.addEventListener('pause', () => { setPlayIcon(false); clearTimeout(player.hideTimer); overlay.classList.remove('hud-hidden'); saveProgressNow(); });
video.addEventListener('ended', () => {
  setPlayIcon(false);
  $('#pc-skip').hidden = true;
  saveProgressNow();
  scrobbleCurrent();
  if (state.settings?.autoplayNext && player.episode) playNextEpisode(true);
});
video.addEventListener('timeupdate', () => {
  const dur = Number.isFinite(video.duration) ? video.duration : 0;
  $('#pc-time').textContent = `${fmtTime(video.currentTime)} / ${fmtTime(dur)}`;
  const seek = $('#seek');
  if (dur > 0) {
    const frac = Math.min(1, video.currentTime / dur);
    $('#seek-fill').style.width = `${frac * 100}%`;
    $('#seek-knob').style.left = `${frac * 100}%`;
  }
  const now = Date.now();
  if (now - (player.lastSave || 0) > 5000) { player.lastSave = now; saveProgressNow(); }
  if (state.settings?.skipIntroOutro && player.skipSegments.length) updateSkipUi();
});
video.addEventListener('progress', () => {
  try {
    if (video.buffered.length && Number.isFinite(video.duration) && video.duration > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      $('#seek-buffer').style.width = `${Math.min(100, (end / video.duration) * 100)}%`;
    }
  } catch { /* ignore */ }
});
video.addEventListener('waiting', () => pokeHud());

const seekEl = $('#seek');
function seekFromEvent(e) {
  const rect = seekEl.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  if (Number.isFinite(video.duration)) video.currentTime = frac * video.duration;
}
let seeking = false;
seekEl.addEventListener('pointerdown', (e) => { seeking = true; seekEl.setPointerCapture(e.pointerId); seekFromEvent(e); });
seekEl.addEventListener('pointermove', (e) => { if (seeking) seekFromEvent(e); });
seekEl.addEventListener('pointerup', () => { seeking = false; });
seekEl.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 30 : 5;
  if (e.key === 'ArrowLeft') { video.currentTime = Math.max(0, video.currentTime - step); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { video.currentTime = Math.min(video.duration || 0, video.currentTime + step); e.preventDefault(); }
});

/* next episode helper (keyboard shortcut + autoplay on ended) */
async function playNextEpisode(fromAuto = false) {
  if (!player.episodeList.length || !player.episode) { if (!fromAuto) toast('No episode list for this title.', 'info'); return; }
  const idx = player.episodeList.findIndex((e) => (e.season ?? 1) === (player.episode.season ?? 1) && e.episode === player.episode.episode);
  const next = player.episodeList[idx + 1];
  if (!next) { if (!fromAuto) toast('This is the latest episode.', 'info'); return; }
  saveProgressNow();
  const d = await api.bridge.load(player.provider, player.detailUrl).catch(() => null);
  await playEpisode(player.provider, player.detailUrl, d || { name: player.title, posterUrl: null, episodes: { None: player.episodeList } }, next, null);
}

/* playback keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  if ($('#player-overlay').hidden) return;
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { e.preventDefault(); closePlayer(); }
  else if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
  else if (k === 'f') { e.preventDefault(); $('#pc-fullscreen').click(); }
  else if (k === 'm') { e.preventDefault(); video.muted = !video.muted; }
  else if (k === 's') { e.preventDefault(); $('#player-panel').hidden = !$('#player-panel').hidden; }
  else if (k === 'n') { e.preventDefault(); playNextEpisode(); }
  else if (k === 'arrowleft' || k === 'j') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
  else if (k === 'arrowright' || k === 'l') { e.preventDefault(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); }
});

async function refreshLibraryButton() {
  const btn = $('#pc-library');
  const key = `${player.provider}:${player.detailUrl}`;
  const entry = (await api.library.list()).find((e) => e.key === key);
  btn.classList.toggle('active', !!entry);
  player.inLibrary = !!entry;
}
$('#pc-library').addEventListener('click', async () => {
  const key = `${player.provider}:${player.detailUrl}`;
  if (player.inLibrary) {
    await api.library.remove(key);
    toast('Removed from library');
  } else {
    await api.library.upsert({ key, provider: player.provider, url: player.detailUrl, name: player.title, posterUrl: null, type: null });
    toast('Added to library', 'success');
  }
  refreshLibraryButton();
});

/* ═══════════ downloads ═══════════ */
async function downloadDetail(d, provider, url, button) {
  const kind = d.kind || 'unknown';
  if (kind === 'anime' || kind === 'tvseries') {
    const groups = flattenEpisodes(d);
    const all = groups.flatMap((g) => g.episodes);
    if (!all.length) { toast('No episodes to download.', 'error'); return; }
    const ep = all[0];
    button.disabled = true;
    try {
      const res = await api.bridge.loadLinks(provider, ep.data, ep.episode != null ? String(ep.episode) : null);
      const links = ((res && res.links) || []).filter((l) => !l.isM3u8);
      if (!links.length) { toast('No downloadable (non-HLS) stream found for this episode.', 'error'); return; }
      const best = bestLink(links, 'highest');
      await queueDownload(best, `${d.name || 'episode'} ${episodeSummary(ep)}`, provider, button);
    } finally { button.disabled = false; }
    return;
  }
  const data = kind === 'torrent' ? (d.magnet || d.torrent) : d.dataUrl;
  if (!data) { toast('Nothing downloadable on this title.', 'error'); return; }
  button.disabled = true;
  try {
    const res = await api.bridge.loadLinks(provider, data, null);
    const links = ((res && res.links) || []).filter((l) => l.url && !l.isM3u8);
    if (!links.length) { toast('No direct (non-HLS) stream found to download.', 'error'); return; }
    const best = bestLink(links, 'highest');
    await queueDownload(best, d.name || 'download', provider, button);
  } finally { button.disabled = false; }
}

async function queueDownload(link, label, provider, button) {
  try {
    const headers = playerHeaders(link);
    await api.downloads.enqueue({
      url: link.url,
      name: sanitizeName(`${label}${extFromUrl(link.url)}`),
      headers,
      referer: link.referer || undefined,
      proxyBase: null,
      provider,
    });
    toast('Added to downloads', 'success');
    go('downloads');
  } catch (err) {
    toast(`Couldn’t queue download: ${err.message || err}`, 'error');
  }
}
const sanitizeName = (name) => String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
function extFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const m = /\.(mp4|mkv|webm|m4a|mp3|flac|aac|mov|zip|apk)(\?|$)/i.exec(path);
    return m ? `.${m[1].toLowerCase()}` : '.mp4';
  } catch { return '.mp4'; }
}

/* ═══════════ LIBRARY screen ═══════════ */
async function renderLibrary() {
  await renderContinueBlock($('#library-continue'));
  const host = $('#library-bookmarks');
  const clearBtn = $('#library-clear');
  host.innerHTML = '';
  const items = await api.library.list();
  $('#library-empty').hidden = items.length > 0;
  clearBtn.hidden = items.length === 0;
  if (items.length) {
    const title = el('div', 'section-row-title', 'Bookmarks');
    title.style.marginBottom = '10px';
    host.appendChild(title);
    const grid = el('div', 'library-row');
    for (const item of items) {
      grid.appendChild(posterCardNode({ name: item.name, url: item.url, posterUrl: item.posterUrl, type: item.type }, item.provider));
    }
    host.appendChild(grid);
  }
}
$('#library-clear').addEventListener('click', async () => {
  const ok = await confirmModal('Clear library', 'Remove all saved titles from your library? This does not delete files.', 'Clear library', true);
  if (ok) { await api.library.clear(); toast('Library cleared'); renderLibrary(); }
});

/* ═══════════ DOWNLOADS screen ═══════════ */
async function renderDownloads() {
  const list = $('#downloads-list');
  list.innerHTML = '';
  const jobs = await api.downloads.list();
  const active = jobs.filter((j) => j.status === 'downloading' || j.status === 'queued').length;
  $('#downloads-sub').textContent = jobs.length ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} · ${active} active` : 'Downloads stay on this device';
  $('#downloads-empty').hidden = jobs.length > 0;
  for (const job of jobs) list.appendChild(downloadRow(job));
}
function downloadRow(job) {
  const row = el('div', 'download-row');
  const icon = el('div', 'download-icon');
  icon.innerHTML = job.status === 'done'
    ? '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 4v10M8.5 10.5 12 14l3.5-3.5M6 17h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  row.appendChild(icon);

  const info = el('div', 'download-info');
  info.appendChild(el('div', 'download-name', job.name || 'Download'));
  const meta = el('div', 'download-meta');
  meta.appendChild(el('span', `status-pill ${job.status}`, job.status));
  const parts = [];
  if (job.receivedBytes != null) parts.push(fmtBytes(job.receivedBytes));
  if (job.totalBytes) parts.push(`of ${fmtBytes(job.totalBytes)}`);
  if (job.error) parts.push(job.error);
  meta.appendChild(el('span', null, parts.join(' ')));
  info.appendChild(meta);
  const bar = el('div', 'download-bar');
  const fill = el('div');
  fill.style.width = `${Math.round((job.progress || 0) * 100)}%`;
  bar.appendChild(fill);
  info.appendChild(bar);
  row.appendChild(info);

  const actions = el('div', 'download-actions');
  if (job.status === 'downloading' || job.status === 'queued') {
    const cancel = iconButton('<svg viewBox="0 0 24 24" width="17" height="17"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>', 'Cancel download');
    cancel.onclick = () => api.downloads.cancel(job.id);
    actions.appendChild(cancel);
  } else {
    const remove = iconButton('<svg viewBox="0 0 24 24" width="17" height="17"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'Remove from list');
    remove.onclick = () => api.downloads.remove(job.id, { deleteFile: false });
    actions.appendChild(remove);
    if (job.filePath) {
      const show = iconButton('<svg viewBox="0 0 24 24" width="17" height="17"><path d="M3 8l2-3h5l2 2h9v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>', 'Show in folder');
      show.onclick = () => api.showItemInFolder(job.filePath);
      actions.appendChild(show);
    }
  }
  row.appendChild(actions);
  return row;
}
function iconButton(svg, title) {
  const btn = el('button', 'icon-btn');
  btn.innerHTML = svg;
  btn.title = title;
  return btn;
}
let downloadsLive = false;
if (!downloadsLive) {
  downloadsLive = true;
  api.downloads.onUpdate(() => { if (!$('#screen-downloads').hidden) renderDownloads(); });
}

/* ═══════════ EXTENSIONS screen ═══════════ */
let discoverCache = [];

function extIconNode(iconUrl, name) {
  if (iconUrl && /^https?:\/\//i.test(iconUrl)) {
    const img = document.createElement('img');
    img.className = 'ext-icon';
    img.src = iconUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.replaceWith(extIconNode(null, name));
    return img;
  }
  return el('div', 'ext-icon-fallback', (name || '?').trim().charAt(0).toUpperCase());
}

async function renderExtensions() {
  await refreshBridge();
  await renderInstalled();
  await renderCatalog();
  // Only (re)load discover data when its tab has data or first visit
  if (!discoverCache.length) renderDiscover(false);
}

async function renderInstalled() {
  const grid = $('#installed-grid');
  const empty = $('#installed-empty');
  const count = $('#installed-count');
  grid.innerHTML = '';
  const plugins = await api.plugins.list();
  const enabledCount = plugins.filter((p) => p.enabled).length;
  count.textContent = plugins.length ? `${plugins.length} installed · ${enabledCount} enabled` : '';
  empty.hidden = plugins.length > 0;
  $('#update-all').hidden = plugins.length === 0;
  for (const p of plugins) grid.appendChild(installedCard(p));
}

function installedCard(p) {
  const card = el('div', 'ext-card');
  const head = el('div', 'ext-card-head');
  head.appendChild(extIconNode(p.iconUrl, p.name));
  const meta = el('div', null);
  meta.style.minWidth = '0';
  meta.appendChild(el('div', 'ext-name', p.name || p.internalName));
  meta.appendChild(el('div', 'ext-sub', `v${p.version ?? '?'} · ${p.language || 'any'} · ${p.repoName || 'repository'}`));
  head.appendChild(meta);
  card.appendChild(head);
  card.appendChild(el('div', 'ext-desc', p.description || 'No description provided.'));
  const foot = el('div', 'ext-foot');
  const left = el('div', 'ext-foot-left');
  const toggle = el('label', 'switch');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!p.enabled;
  input.setAttribute('aria-label', `Enable ${p.name}`);
  input.onchange = async () => {
    await api.plugins.setEnabled(p.id, input.checked);
    await api.plugins.applyToBridge();
    toast(input.checked ? `${p.name} enabled` : `${p.name} disabled`);
    renderInstalled();
    refreshBridge();
  };
  toggle.appendChild(input);
  toggle.appendChild(el('span', 'switch-track'));
  left.appendChild(toggle);
  foot.appendChild(left);
  const right = el('div', 'ext-foot-left');
  const updateBtn = el('button', 'btn btn-small btn-ghost', 'Update');
  updateBtn.onclick = async () => {
    updateBtn.disabled = true;
    try {
      const res = await api.plugins.update(p.id);
      toast(res.updated ? `${p.name} updated` : `${p.name} is up to date`, res.updated ? 'success' : 'info');
      await api.plugins.applyToBridge();
      renderInstalled();
      refreshBridge();
    } catch (err) {
      toast(`Update failed: ${err.message || err}`, 'error');
    } finally { updateBtn.disabled = false; }
  };
  const removeBtn = el('button', 'btn btn-small btn-danger', 'Remove');
  removeBtn.onclick = async () => {
    const ok = await confirmModal('Remove extension', `Remove “${p.name}” and delete its .cs3 file?`, 'Remove', true);
    if (!ok) return;
    await api.plugins.uninstall(p.id);
    await api.plugins.applyToBridge();
    toast(`${p.name} removed`);
    renderInstalled();
    refreshBridge();
  };
  right.append(updateBtn, removeBtn);
  foot.appendChild(right);
  card.appendChild(foot);
  return card;
}

$('#update-all').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const results = await api.plugins.updateAll();
    const updated = results.filter((r) => r.updated).length;
    const failed = results.filter((r) => r.error).length;
    toast(`${updated} updated${failed ? `, ${failed} failed` : ''}`, failed ? 'error' : 'success');
    await api.plugins.applyToBridge();
    renderInstalled();
    refreshBridge();
  } finally { btn.disabled = false; }
});

/* tabs */
$$('#extensions-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('#extensions-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    const target = tab.dataset.tab;
    $('#tab-installed').hidden = target !== 'installed';
    $('#tab-discover').hidden = target !== 'discover';
    $('#tab-repos').hidden = target !== 'repos';
    if (target === 'repos') renderRepos();
    if (target === 'discover' && !discoverCache.length) renderDiscover(false);
  });
});

async function renderDiscover(bypassCache) {
  const body = $('#discover-body');
  body.innerHTML = '<div class="loading-line"><div class="spinner"></div> Loading repositories…</div>';
  try {
    const [available, repos] = await Promise.all([api.repos.availablePlugins({ bypassCache }), api.repos.list()]);
    discoverCache = available;
    renderDiscoverBody(available, repos);
  } catch (err) {
    body.innerHTML = '';
    const node = el('div', 'loading-line', `Failed to fetch repositories: ${err.message || err}`);
    body.appendChild(node);
  }
}

function matchesFilter(entry) {
  const q = ($('#plugin-filter').value || '').trim().toLowerCase();
  const installedOnly = $('#plugin-filter-installed').checked;
  if (installedOnly && !entry.installed) return false;
  if (!q) return true;
  const p = entry.plugin;
  const hay = [p.name, p.internalName, p.description, entry.repo && entry.repo.name, (p.tvTypes || []).join(' '), p.language].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function renderDiscoverBody(available) {
  const body = $('#discover-body');
  body.innerHTML = '';
  const groups = new Map();
  for (const entry of available) {
    if (!matchesFilter(entry)) continue;
    const key = entry.repo.url;
    if (!groups.has(key)) groups.set(key, { repo: entry.repo, items: [], error: entry.error || null });
    if (entry.plugin) groups.get(key).items.push(entry);
  }
  if (!groups.size) {
    body.innerHTML = '<div class="empty-state small"><h2>Nothing found</h2><p>Add a repository above, or clear the filter.</p></div>';
    return;
  }
  for (const group of groups.values()) {
    const section = el('div', 'discover-section');
    const title = el('div', 'discover-section-title', group.repo.name || group.repo.url);
    section.appendChild(title);
    if (group.error) {
      section.appendChild(el('div', 'loading-line', `Failed: ${group.error}`));
      body.appendChild(section);
      continue;
    }
    const grid = el('div', 'ext-grid');
    for (const entry of group.items) grid.appendChild(discoverCard(entry));
    section.appendChild(grid);
    body.appendChild(section);
  }
}

function discoverCard(entry) {
  const p = entry.plugin;
  const card = el('div', 'ext-card');
  const head = el('div', 'ext-card-head');
  head.appendChild(extIconNode(p.iconUrl, p.name));
  const meta = el('div', null);
  meta.style.minWidth = '0';
  meta.appendChild(el('div', 'ext-name', p.name || p.internalName));
  const sub = [`v${p.version ?? '?'}`, p.language || null].filter(Boolean).join(' · ');
  meta.appendChild(el('div', 'ext-sub', sub));
  head.appendChild(meta);
  card.appendChild(head);
  card.appendChild(el('div', 'ext-desc', p.description || 'No description provided.'));
  const foot = el('div', 'ext-foot');
  const left = el('div', 'ext-foot-left');
  if (entry.updateAvailable) left.appendChild(el('span', 'update-pill', 'UPDATE'));
  if (p.status && p.status !== 1) left.appendChild(el('span', 'update-pill', entry.status.toUpperCase()));
  foot.appendChild(left);
  const right = el('div', 'ext-foot-left');
  if (entry.installed) {
    const label = entry.enabled ? 'Enabled' : 'Disabled';
    const stateLabel = el('span', 'ext-sub', `Installed · ${label}`);
    right.appendChild(stateLabel);
    const toggleBtn = el('button', 'btn btn-small btn-ghost', entry.enabled ? 'Disable' : 'Enable');
    toggleBtn.onclick = async () => {
      await api.plugins.setEnabled(p.internalName, !entry.enabled);
      await api.plugins.applyToBridge();
      discoverCache = [];
      renderDiscover(false);
      renderInstalled();
      refreshBridge();
    };
    right.appendChild(toggleBtn);
  } else {
    const installBtn = el('button', 'btn btn-small btn-accent', 'Install');
    installBtn.onclick = async () => {
      installBtn.disabled = true;
      installBtn.textContent = 'Installing…';
      try {
        await api.plugins.install(p, entry.repo.url);
        await api.plugins.applyToBridge();
        toast(`${p.name} installed`, 'success');
        discoverCache = [];
        renderDiscover(false);
        renderInstalled();
        refreshBridge();
      } catch (err) {
        toast(`Install failed: ${err.message || err}`, 'error', 6000);
        installBtn.disabled = false;
        installBtn.textContent = 'Install';
      }
    };
    right.appendChild(installBtn);
  }
  foot.appendChild(right);
  card.appendChild(foot);
  return card;
}

$('#plugin-filter').addEventListener('input', debounce(() => { if (discoverCache.length) renderDiscoverBody(discoverCache); }, 180));
$('#plugin-filter-installed').addEventListener('change', () => { if (discoverCache.length) renderDiscoverBody(discoverCache); });
$('#repo-add').addEventListener('click', addRepoFromInput);
$('#repo-url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addRepoFromInput(); });
async function addRepoFromInput() {
  const input = $('#repo-url-input');
  const url = input.value.trim();
  if (!url) return;
  const btn = $('#repo-add');
  btn.disabled = true;
  try {
    await api.repos.add(url);
    input.value = '';
    discoverCache = [];
    toast('Repository added', 'success');
    renderDiscover(true);
    renderRepos();
  } catch (err) {
    toast(`Couldn’t add repository: ${err.message || err}`, 'error', 6000);
  } finally { btn.disabled = false; }
}

async function renderCatalog() {
  const wrap = $('#catalog-chips');
  wrap.innerHTML = '';
  let catalog = [];
  try { catalog = await api.repos.catalog(); } catch { /* none */ }
  catalog = [...catalog].sort((a, b) => Number(!!b.verified) - Number(!!a.verified));
  for (const source of catalog) {
    const chip = el('button', `catalog-chip${source.verified ? ' verified' : ''}`, source.name || source.url);
    chip.title = `${source.url}${source.description ? ` — ${source.description}` : ''}`;
    chip.onclick = async () => {
      $('#repo-url-input').value = source.url;
      $('#repo-add').click();
    };
    wrap.appendChild(chip);
  }
}

async function renderRepos() {
  const body = $('#repos-body');
  body.innerHTML = '<div class="loading-line"><div class="spinner"></div> Loading…</div>';
  const repos = await api.repos.list();
  body.innerHTML = '';
  if (!repos.length) {
    body.innerHTML = '<div class="empty-state small"><h2>No repositories</h2><p>Add one from the Discover tab.</p></div>';
    return;
  }
  for (const repo of repos) {
    const card = el('div', 'repo-card');
    const info = el('div', 'repo-info');
    info.appendChild(el('div', 'repo-name', repo.name));
    info.appendChild(el('div', 'repo-url', repo.url));
    if (repo.description) info.appendChild(el('div', 'repo-desc', repo.description));
    card.appendChild(info);
    const toggle = el('label', 'switch');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = repo.enabled !== false;
    input.setAttribute('aria-label', `Enable ${repo.name}`);
    input.onchange = async () => {
      await api.repos.setEnabled(repo.url, input.checked);
      discoverCache = [];
      toast(input.checked ? 'Repository enabled' : 'Repository disabled');
    };
    toggle.appendChild(input);
    toggle.appendChild(el('span', 'switch-track'));
    card.appendChild(toggle);
    const remove = el('button', 'btn btn-small btn-danger', 'Remove');
    remove.onclick = async () => {
      const ok = await confirmModal('Remove repository', `Remove “${repo.name}” and any extensions installed from it?`, 'Remove', true);
      if (!ok) return;
      await api.repos.remove(repo.url);
      discoverCache = [];
      toast('Repository removed');
      renderRepos();
      renderInstalled();
      refreshBridge();
    };
    card.appendChild(remove);
    body.appendChild(card);
  }
}

$('#extensions-reload').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const result = await api.plugins.applyToBridge();
    const failed = (result.failed || []).length;
    const loaded = (result.providers || []).length;
    toast(`Bridge reloaded — ${loaded} provider${loaded === 1 ? '' : 's'}${failed ? ` · ${failed} failed to load` : ''}`, failed ? 'error' : 'success');
    if (failed) console.warn('failed plugins', result.failed);
    refreshBridge();
  } catch (err) {
    toast(`Reload failed: ${err.message || err}`, 'error');
  } finally { btn.disabled = false; }
});

/* ═══════════ SETTINGS screen ═══════════ */
async function renderSettings() {
  const body = $('#settings-body');
  body.innerHTML = '<div class="loading-line"><div class="spinner"></div> Loading…</div>';
  const [settings, appInfo, traktStatus] = await Promise.all([
    api.settings.get(),
    api.appInfo().catch(() => ({})),
    api.trakt.status().catch(() => null),
  ]);
  state.settings = settings;
  body.innerHTML = '';

  // ── Appearance ────────────────────────────────────────────────────────────
  const appearance = settingsCard('Appearance', 'Theme, accent and motion');
  appearance.appendChild(settingRow('Theme', 'Sky matches the website — blue sky, drifting clouds. Dark suits late-night, Glass is Shiopa-style frost', (() => {
    const seg = el('div', 'segmented');
    for (const [value, label] of [['sky', 'Sky'], ['dark', 'Dark'], ['amoled', 'AMOLED'], ['light', 'Light'], ['glass', 'Glass']]) {
      const b = el('button', settings.theme === value ? 'active' : '', label);
      b.onclick = async () => { await patchSettings({ theme: value }); renderSettings(); };
      seg.appendChild(b);
    }
    return seg;
  })()));
  appearance.appendChild(settingRow('Accent colour', 'Used across buttons, focus and playback', (() => {
    const sw = el('div', 'swatches');
    for (const color of ACCENTS) {
      const b = el('button', `swatch${(settings.accent || '').toUpperCase() === color ? ' active' : ''}`);
      b.style.background = color;
      b.title = color;
      b.onclick = async () => { await patchSettings({ accent: color }); renderSettings(); };
      sw.appendChild(b);
    }
    return sw;
  })()));
  appearance.appendChild(settingRow('Reduce motion', 'Minimise animations (accessibility)', toggle(
    !!settings.reduceMotion,
    async (v) => { await patchSettings({ reduceMotion: v }); document.documentElement.style.setProperty('--screen-anim', v ? 'none' : ''); } )));
  body.appendChild(appearance);

  // ── Playback ─────────────────────────────────────────────────────────────
  const playback = settingsCard('Playback', 'Quality, skip behaviour and autoplay');
  playback.appendChild(settingRow('Default quality', 'Applied when opening a stream', (() => {
    const seg = el('div', 'segmented');
    for (const [value, label] of [['auto', 'Auto'], ['highest', 'Highest'], ['lowest', 'Lowest']]) {
      const b = el('button', settings.defaultQuality === value ? 'active' : '', label);
      b.onclick = async () => { await patchSettings({ defaultQuality: value }); renderSettings(); };
      seg.appendChild(b);
    }
    return seg;
  })()));
  playback.appendChild(settingRow('Skip intro (seconds)', 'Auto-seek every episode by N seconds', (() => {
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.max = '600'; input.step = '5';
    input.className = 'number-input'; input.value = String(settings.skipIntroSeconds ?? 0);
    input.onchange = () => patchSettings({ skipIntroSeconds: Math.max(0, Number(input.value) || 0) });
    return input;
  })()));
  playback.appendChild(settingRow('Autoplay next episode', 'Start the following episode automatically', toggle(!!settings.autoplayNext, (v) => patchSettings({ autoplayNext: v }))));
  playback.appendChild(settingRow('Hardware acceleration', 'Use the GPU for video decode (restart required)', toggle(!!settings.hardwareAcceleration, (v) => patchSettings({ hardwareAcceleration: v }))));
  body.appendChild(playback);

  // ── Explore & tracking ────────────────────────────────────────────────────
  const tracking = settingsCard('Explore & tracking', 'TMDB discovery, intro/outro skip and Trakt scrobbling');
  const keyInput = (value, placeholder, onCommit, type = 'text') => {
    const input = document.createElement('input');
    input.type = type;
    input.className = 'text-input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = value || '';
    input.onchange = () => onCommit(input.value.trim());
    return input;
  };
  tracking.appendChild(settingRow('TMDB API key', 'Free key from themoviedb.org/settings/api — unlocks the Explore screen and IMDb resolution for skip data', keyInput(settings.tmdbApiKey, 'Paste your key…', (v) => patchSettings({ tmdbApiKey: v }))));
  tracking.appendChild(settingRow('Skip intro & outro', 'Crowdsourced IntroDB segments (needs TMDB key); AniSkip for anime when a client ID is set', toggle(!!settings.skipIntroOutro, (v) => patchSettings({ skipIntroOutro: v }))));
  tracking.appendChild(settingRow('Auto-skip segments', 'Seek automatically instead of showing a Skip button', toggle(!!settings.skipAuto, (v) => patchSettings({ skipAuto: v }))));
  tracking.appendChild(settingRow('AnimeSkip client ID', 'Optional — enables AniSkip anime timing data (anime-skip.com)', keyInput(settings.animeSkipClientId, 'Client ID…', (v) => patchSettings({ animeSkipClientId: v }))));
  tracking.appendChild(settingRow('Trakt client ID', 'Register a free app at trakt.tv/oauth/applications and enable device code', keyInput(settings.traktClientId, 'Client ID…', (v) => patchSettings({ traktClientId: v }))));
  tracking.appendChild(settingRow('Trakt client secret', 'Stored on this device only; used solely for the sign-in flow', keyInput(settings.traktClientSecret, 'Client secret…', (v) => patchSettings({ traktClientSecret: v }), 'password')));
  tracking.appendChild(settingRow('Trakt', 'Report finished movies & episodes to your Trakt history', (() => {
    const box = el('div', 'trakt-box');
    const status = el('div', 'trakt-status', traktStatus?.signedIn
      ? `Signed in${traktStatus.user?.username ? ` as ${traktStatus.user.username}` : ''}`
      : (traktStatus?.configured ? 'Not signed in' : 'Add your client ID & secret first'));
    box.appendChild(status);
    if (traktStatus?.signedIn) {
      const out = el('button', 'btn btn-ghost btn-small', 'Sign out');
      out.onclick = async () => { await api.trakt.signOut(); toast('Signed out of Trakt', 'info'); renderSettings(); };
      box.appendChild(out);
    } else {
      const signIn = el('button', 'btn btn-accent btn-small', 'Sign in with Trakt');
      signIn.onclick = async () => {
        signIn.disabled = true;
        signIn.textContent = 'Contacting Trakt…';
        try {
          const res = await api.trakt.signIn();
          box.innerHTML = '';
          box.appendChild(el('div', 'trakt-code', res.userCode));
          box.appendChild(el('div', 'setting-hint', `Enter this code at ${res.verificationUrl} — this page updates once you approve.`));
          const open = el('button', 'btn btn-accent btn-small', 'Open trakt.tv/activate');
          open.onclick = () => api.openExternal(res.verificationUrl);
          box.appendChild(open);
        } catch (err) {
          toast((err && err.message) || 'Trakt sign-in failed', 'error');
          renderSettings();
        }
      };
      box.appendChild(signIn);
    }
    return box;
  })()));
  body.appendChild(tracking);

  // ── Subtitles ─────────────────────────────────────────────────────────────
  const subs = settingsCard('Subtitles', 'Size and colour for WebVTT tracks');
  subs.appendChild(settingRow('Size', `${settings.subtitleSize ?? 100}% of default`, (() => {
    const input = document.createElement('input');
    input.type = 'range'; input.min = '60'; input.max = '200'; input.step = '10';
    input.className = 'range'; input.value = String(settings.subtitleSize ?? 100);
    const valueNode = el('span', 'setting-hint', `${input.value}%`);
    valueNode.style.minWidth = '42px'; valueNode.textAlign = 'right';
    input.oninput = () => { valueNode.textContent = `${input.value}%`; };
    input.onchange = () => { patchSettings({ subtitleSize: Number(input.value) }); applySubtitleStyle(Number(input.value), settings.subtitleColor); };
    const wrap = el('div'); wrap.style.cssText = 'display:flex;gap:10px;align-items:center';
    wrap.append(input, valueNode);
    return wrap;
  })()));
  subs.appendChild(settingRow('Colour', 'Applies to rendered tracks', (() => {
    const sw = el('div', 'swatches');
    for (const color of SUBTITLE_COLORS) {
      const b = el('button', `swatch${(settings.subtitleColor || '#FFFFFF').toUpperCase() === color ? ' active' : ''}`);
      b.style.background = color;
      b.onclick = async () => { await patchSettings({ subtitleColor: color }); applySubtitleStyle(settings.subtitleSize, color); renderSettings(); };
      sw.appendChild(b);
    }
    return sw;
  })()));
  body.appendChild(subs);

  // ── Network / updates ─────────────────────────────────────────────────────
  const network = settingsCard('Network', 'How the app fetches repositories and extensions');
  network.appendChild(settingRow('jsDelivr proxy', 'Fetch GitHub content through cdn.jsdelivr.net', toggle(!!settings.jsdelivrProxy, (v) => patchSettings({ jsdelivrProxy: v }))));
  network.appendChild(settingRow('Check extension updates on launch', 'Automatically update all enabled extensions at startup', toggle(!!settings.checkUpdatesOnLaunch, (v) => patchSettings({ checkUpdatesOnLaunch: v }))));
  body.appendChild(network);

  // ── Storage ───────────────────────────────────────────────────────────────
  const storage = settingsCard('Storage', 'Where files live on this machine');
  const dl = el('div', 'path-box', appInfo.downloadDir || 'Not resolved yet');
  storage.appendChild(settingRow('Download folder', 'Direct media files are saved here', (() => {
    const b = el('button', 'btn btn-small btn-ghost', 'Change…');
    b.onclick = async () => { const picked = await api.pickDownloadDir(); if (picked) renderSettings(); };
    return b;
  })()));
  storage.appendChild(dl);
  storage.appendChild(settingRow('App data', 'Settings, library, watch progress', (() => {
    const b = el('button', 'btn btn-small btn-ghost', 'Open');
    b.onclick = () => appInfo.userData && api.openPath(appInfo.userData);
    return b;
  })()));
  body.appendChild(storage);

  // ── About ───────────────────────────────────────────────────────────────────
  const about = settingsCard('About', 'Skystream');
  about.appendChild(settingRow('Updates', 'Check GitHub for a newer desktop release', (() => {
    const wrap = el('div', 'update-check');
    const b = el('button', 'btn btn-small btn-ghost', 'Check for updates');
    const status = el('div', 'setting-hint');
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = 'Checking…';
      status.textContent = '';
      try {
        const result = await api.checkForUpdates();
        if (result.status === 'current') {
          status.textContent = `You're on the latest version (${result.latest}).`;
        } else if (result.status === 'update-available') {
          status.textContent = `Update available: v${result.version}`;
          const dl = el('button', 'btn btn-small btn-accent', 'Download');
          dl.onclick = () => api.openExternal(result.url);
          wrap.appendChild(dl);
        } else {
          status.textContent = `Couldn't check: ${result.message || 'unknown error'}`;
        }
      } catch (err) {
        status.textContent = `Couldn't check: ${err && err.message ? err.message : err}`;
      } finally {
        b.disabled = false;
        b.textContent = 'Check for updates';
      }
    };
    wrap.appendChild(b);
    wrap.appendChild(status);
    return wrap;
  })()));
  about.appendChild(settingRow('Version', appInfo.version || '0.0.0', (() => {
    const b = el('button', 'btn btn-small btn-ghost', 'Copy diagnostics');
    b.onclick = async () => {
      const info = [
        `Skystream ${appInfo.version || '?'} (${appInfo.packaged ? 'packaged' : 'dev'})`,
        `Electron ${appInfo.electron || '?'} · Chromium ${appInfo.chromium || '?'} · Node ${appInfo.node || '?'}`,
        `Platform: ${appInfo.platform || '?'}`,
        `Bridge: ${appInfo.bridge ? JSON.stringify(appInfo.bridge) : 'unknown'}`,
      ].join('\n');
      try { await navigator.clipboard.writeText(info); toast('Diagnostics copied', 'success'); }
      catch { toast('Clipboard unavailable', 'error'); }
    };
    return b;
  })()));
  body.appendChild(about);
}

function settingsCard(title, subtitle) {
  const card = el('div', 'settings-card');
  card.appendChild(el('h2', null, title));
  card.appendChild(el('div', 'card-sub', subtitle));
  return card;
}
function settingRow(label, hint, control) {
  const row = el('div', 'setting-row');
  const wrap = el('div', null);
  wrap.appendChild(el('div', 'setting-label', label));
  if (hint) wrap.appendChild(el('div', 'setting-hint', hint));
  row.appendChild(wrap);
  row.appendChild(control);
  return row;
}
function toggle(initial, onChange) {
  const label = el('label', 'switch');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!initial;
  input.onchange = () => onChange(input.checked);
  label.appendChild(input);
  label.appendChild(el('span', 'switch-track'));
  return label;
}
function applySubtitleStyle(sizePct, color) {
  let styleEl = document.getElementById('subtitle-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'subtitle-style';
    document.head.appendChild(styleEl);
  }
  const scale = Math.min(2, Math.max(0.6, (sizePct || 100) / 100));
  styleEl.textContent = `video::cue { color: ${color || '#FFFFFF'}; font-size: ${Math.round(scale * 100)}%; }`;
}

/* ═══════════ wiring: shell, titlebar, navigation ═══════════ */
$('#tb-min').addEventListener('click', () => api.window.minimize());
$('#tb-close').addEventListener('click', () => api.window.close());
const maxBtn = $('#tb-max');
maxBtn.addEventListener('click', async () => {
  await api.window.toggleMaximize();
  syncMaximizeButton();
});
async function syncMaximizeButton() {
  const maximized = await api.window.isMaximized().catch(() => false);
  $('.ic-max', maxBtn).hidden = maximized;
  $('.ic-restore', maxBtn).hidden = !maximized;
}
api.window.onMaximizedChanged((maximized) => {
  $('.ic-max', maxBtn).hidden = maximized;
  $('.ic-restore', maxBtn).hidden = !maximized;
});
api.trakt.onChanged((payload) => {
  if (payload && payload.signedIn) {
    toast(`Signed in to Trakt${payload.user?.username ? ` as ${payload.user.username}` : ''}`, 'success');
  } else if (payload && payload.error) {
    toast(payload.error, 'error');
  }
  if (!$('#screen-settings').hidden) renderSettings();
});

$$('.nav-item').forEach((btn) => btn.addEventListener('click', () => go(btn.dataset.nav)));
$('#home-refresh').addEventListener('click', () => renderHome());
$('#home-offline-retry').addEventListener('click', async () => {
  $('#home-offline-retry').textContent = 'Retrying…';
  await api.plugins.applyToBridge().catch(() => {});
  const ok = await refreshBridge();
  $('#home-offline-retry').textContent = 'Retry';
  if (ok) renderHome();
});
$('#home-empty-cta').addEventListener('click', () => go('extensions'));

$('#downloads-open-dir').addEventListener('click', async () => {
  const info = await api.appInfo().catch(() => ({}));
  if (info.downloadDir) api.openPath(info.downloadDir);
});
$('#downloads-clear-done').addEventListener('click', async () => {
  const jobs = await api.downloads.list();
  const finished = jobs.filter((j) => j.status === 'done' || j.status === 'error' || j.status === 'cancelled');
  for (const job of finished) await api.downloads.remove(job.id, { deleteFile: false });
  renderDownloads();
});

api.onExtensionsChanged(() => {
  if (!$('#screen-extensions').hidden) renderInstalled();
  else refreshBridge();
});

/* ═══════════ init ═══════════ */
(async function init() {
  if (!api) {
    document.body.innerHTML = '<div class="empty-state"><h2>Preload failed</h2><p>window.skystream is missing — restart the app.</p></div>';
    return;
  }
  try {
    await loadSettings();
    applySubtitleStyle(state.settings?.subtitleSize ?? 100, state.settings?.subtitleColor);
  } catch (err) { console.warn('settings load failed', err); }
  await refreshBridge();
  await renderSearchScope();
  window.addEventListener('hashchange', renderRoute);

  // Optional: auto-update extensions on launch
  if (state.settings?.checkUpdatesOnLaunch) {
    api.plugins.updateAll().then((results) => {
      const updated = (results || []).filter((r) => r.updated).length;
      if (updated) {
        api.plugins.applyToBridge().finally(() => refreshBridge());
        toast(`${updated} extension${updated === 1 ? '' : 's'} auto-updated`, 'success');
      }
    }).catch(() => {});
  }

  syncMaximizeButton();
  renderRoute(); // renders current hash or defaults to home
})();
