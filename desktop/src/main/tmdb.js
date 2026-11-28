'use strict';
/**
 * TMDB (themoviedb.org) client — powers the Explore screen and best-effort
 * ID resolution for skip segments and Trakt scrobbling.
 *
 * The app ships with NO baked-in API key: each user supplies their own free
 * key (Settings → Explore & tracking), mirroring how akashdh11's Cinelab
 * treats its TMDB key. Attribution to TMDB is required by their terms and is
 * shown on the Explore screen.
 *
 * Results are cached in-memory (lists 10 minutes, ID lookups 24 hours),
 * LRU-capped, so re-opening Explore does not hammer the API.
 */
const { fetchJson } = require('./http');
const { LruCache } = require('./cache');

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const LIST_TTL_MS = 10 * 60 * 1000;
const ID_TTL_MS = 24 * 60 * 60 * 1000;

const listCache = new LruCache(500);
const idCache = new LruCache(1000);

function getKey(state) {
  return String(state?.getSettings()?.tmdbApiKey || '').trim();
}

function missingKeyError() {
  const err = new Error('TMDB API key not configured — add your free key in Settings → Explore & tracking.');
  err.code = 'TMDB_NO_KEY';
  return err;
}

function ensureKey(state) {
  if (!getKey(state)) throw missingKeyError();
}

function hasKey(state) {
  return getKey(state).length > 0;
}

async function tmdbFetch(state, path, params = {}) {
  const key = getKey(state);
  if (!key) throw missingKeyError();
  const url = new URL(BASE + path);
  url.searchParams.set('api_key', key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  try {
    return await fetchJson(url.toString());
  } catch (err) {
    if (err.status === 401) {
      const friendly = new Error('TMDB rejected the API key (HTTP 401). Check it in Settings → Explore & tracking.');
      friendly.code = 'TMDB_BAD_KEY';
      throw friendly;
    }
    throw err;
  }
}

function imageUrl(path, size) {
  return path ? `${IMG}/${size || 'w500'}${path}` : null;
}

function mediaTypeOf(raw, fallback) {
  if (raw && raw.media_type === 'tv') return 'tv';
  if (raw && raw.media_type === 'movie') return 'movie';
  if (raw && raw.title) return 'movie';
  if (raw && raw.name) return 'tv';
  return fallback || 'movie';
}

function normalizeItem(raw, fallbackType) {
  if (!raw) return null;
  const mediaType = mediaTypeOf(raw, fallbackType);
  const name = raw.title || raw.name || 'Untitled';
  const date = raw.release_date || raw.first_air_date || '';
  return {
    id: raw.id,
    mediaType,
    name,
    originalName: raw.original_title || raw.original_name || name,
    posterUrl: imageUrl(raw.poster_path, 'w500'),
    backdropUrl: imageUrl(raw.backdrop_path, 'w1280'),
    year: date ? String(date).slice(0, 4) : '',
    rating: typeof raw.vote_average === 'number' ? Math.round(raw.vote_average * 10) / 10 : null,
    votes: raw.vote_count ?? null,
    overview: raw.overview || '',
  };
}

const LIST_PATHS = {
  trending: (mt) => `/trending/${mt}/week`,
  popular: (mt) => `/${mt}/popular`,
  topRated: (mt) => `/${mt}/top_rated`,
  nowPlaying: (mt) => (mt === 'tv' ? '/tv/airing_today' : '/movie/now_playing'),
  upcoming: (mt) => (mt === 'tv' ? '/tv/on_the_air' : '/movie/upcoming'),
};

/**
 * Fetch a normalized list for the Explore screen.
 * section: trending | popular | topRated | nowPlaying | upcoming
 */
async function list(state, { mediaType = 'movie', section = 'trending', page = 1 } = {}) {
  ensureKey(state);
  const mt = mediaType === 'tv' ? 'tv' : 'movie';
  const build = LIST_PATHS[section] || LIST_PATHS.trending;
  const path = build(mt);
  const cacheKey = `list:${path}:${page}`;
  const cached = listCache.get(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch(state, path, { page });
  const items = (data?.results || []).map((r) => normalizeItem(r, mt)).filter(Boolean);
  const payload = { items, page: data?.page || 1, totalPages: data?.total_pages || 1, totalResults: data?.total_results || items.length };
  return listCache.set(cacheKey, payload, LIST_TTL_MS);
}

/** Multi-search (movies + TV). */
async function search(state, { query, page = 1 } = {}) {
  ensureKey(state);
  const q = String(query || '').trim();
  if (!q) return { items: [], page: 1, totalPages: 1, totalResults: 0 };
  const cacheKey = `search:${q.toLowerCase()}:${page}`;
  const cached = listCache.get(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch(state, '/search/multi', { query: q, page, include_adult: 'false' });
  const items = (data?.results || [])
    .filter((r) => !r.media_type || r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => normalizeItem(r))
    .filter(Boolean);
  const payload = { items, page: data?.page || 1, totalPages: data?.total_pages || 1, totalResults: data?.total_results || items.length };
  return listCache.set(cacheKey, payload, LIST_TTL_MS);
}

/** External IDs (IMDb, TVDB) for a movie/tv id. Cached for 24h. */
async function externalIds(state, { mediaType = 'movie', id } = {}) {
  ensureKey(state);
  const mt = mediaType === 'tv' ? 'tv' : 'movie';
  if (!id) return { imdbId: null, tvdbId: null };
  const cacheKey = `ids:${mt}:${id}`;
  const cached = idCache.get(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch(state, `/${mt}/${id}/external_ids`);
  const payload = { imdbId: data?.imdb_id || null, tvdbId: data?.tvdb_id || null };
  return idCache.set(cacheKey, payload, ID_TTL_MS);
}

/**
 * Best-effort match of a free-form title to a TMDB entry.
 * Used to resolve crowdsourced-tracking IDs for titles that came from
 * extensions (which carry no TMDB/IMDb ids of their own).
 * Returns { id, mediaType, imdbId, year } or null.
 */
async function bestMatch(state, { title, year } = {}) {
  ensureKey(state);
  const q = String(title || '').trim();
  if (!q) return null;
  const data = await tmdbFetch(state, '/search/multi', { query: q, include_adult: 'false' });
  const results = (data?.results || []).filter((r) => !r.media_type || r.media_type === 'movie' || r.media_type === 'tv');
  if (!results.length) return null;

  let pick = results[0];
  if (year) {
    const y = String(year).slice(0, 4);
    const exact = results.find((r) => (r.release_date || r.first_air_date || '').startsWith(y));
    if (exact) pick = exact;
  }
  const item = normalizeItem(pick);
  const ids = await externalIds(state, { mediaType: item.mediaType, id: item.id });
  return { id: item.id, mediaType: item.mediaType, name: item.name, year: item.year, imdbId: ids.imdbId };
}

module.exports = {
  hasKey,
  list,
  search,
  externalIds,
  bestMatch,
  // Exported for tests.
  _internal: { normalizeItem, LIST_PATHS },
};
