'use strict';
/**
 * Intro / outro / recap skip segments — desktop port of the design in
 * akashdh11's Cinelab (lib/features/skip), re-implemented against the
 * public HTTP APIs; no upstream code is copied.
 *
 * Two crowdsourced sources, both opt-in and both treated as "best effort":
 *  - IntroDB (https://api.introdb.app) — needs an IMDb id; resolved via the
 *    user's TMDB key when one is configured. No key of its own.
 *  - AniSkip (https://api.anime-skip.com) — needs an AniList id (resolved
 *    via the public AniList GraphQL API, no key) plus a client id supplied
 *    by the user in Settings (optional).
 *
 * AniSkip *replaces* IntroDB's answer when it has one — it is
 * title-specific where IntroDB is crowd-averaged.
 *
 * Every failure path resolves to an empty list: a missing segment is a
 * missing convenience, never a reason to disturb playback. Both caches are
 * LRU-capped with a 1-hour TTL and empty results are cached too, so an
 * all-day binge does not hammer the APIs.
 */
const { fetchJson, postJson } = require('./http');
const { LruCache } = require('./cache');
const tmdb = require('./tmdb');

const INTRODB_URL = 'https://api.introdb.app/segments';
const ANILIST_URL = 'https://graphql.anilist.co';
const ANISKIP_URL = 'https://api.anime-skip.com/graphql';
const CACHE_TTL_MS = 60 * 60 * 1000;
const ANILIST_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new LruCache(500);
const anilistCache = new LruCache(500);

// Global IntroDB rate-limit cooldown (429 → Retry-After, capped at 5 minutes).
let introDbRateLimitedUntil = 0;

const TYPE = { INTRO: 'intro', OUTRO: 'outro', RECAP: 'recap' };

/**
 * Filter / repair / sort raw segments before they reach the player.
 * Port of the semantics: swap backwards pairs, clamp negatives to 0, clamp
 * to a known duration, drop <1s segments, drop unknown types, sort by start.
 */
function sanitizeSegments(raw, durationSec) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const seg of raw) {
    if (!seg) continue;
    let start = Number(seg.start);
    let end = Number(seg.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start > end) { const t = start; start = end; end = t; }
    if (start < 0) start = 0;
    if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
      if (start >= durationSec) continue; // entirely past EOF
      if (end > durationSec) end = durationSec;
    }
    if (end - start < 1.0) continue;
    const type = seg.type;
    if (type !== TYPE.INTRO && type !== TYPE.OUTRO && type !== TYPE.RECAP) continue;
    out.push({ start, end, type });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

function parseRetryAfterSeconds(headerValue) {
  const s = String(headerValue == null ? '' : headerValue).trim();
  if (!s) return 60;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 60;
  return Math.min(Math.floor(n), 300);
}

/** IntroDB: segments for an IMDb id + season + episode. [] on any failure. */
async function introDbSegments({ imdbId, season, episode, durationSec }) {
  if (!imdbId) return [];
  const seasonN = Number.isFinite(+season) && +season > 0 ? Math.floor(+season) : 1;
  const episodeN = Number.isFinite(+episode) && +episode > 0 ? Math.floor(+episode) : 1;
  const key = `introdb:${imdbId}:${seasonN}:${episodeN}`;
  const cached = cache.get(key);
  if (cached) return cached;

  if (Date.now() < introDbRateLimitedUntil) return [];

  const url = new URL(INTRODB_URL);
  url.searchParams.set('imdb_id', String(imdbId));
  url.searchParams.set('season', String(seasonN));
  url.searchParams.set('episode', String(episodeN));

  let segments = [];
  try {
    const data = await fetchJson(url.toString(), { headers: { Accept: 'application/json' } });
    if (data && typeof data === 'object') {
      const raw = [];
      for (const [k, type] of [['intro', TYPE.INTRO], ['recap', TYPE.RECAP], ['outro', TYPE.OUTRO]]) {
        const s = data[k];
        if (s && typeof s === 'object' && Number.isFinite(+s.start_sec) && Number.isFinite(+s.end_sec)) {
          raw.push({ start: +s.start_sec, end: +s.end_sec, type });
        }
      }
      segments = sanitizeSegments(raw, durationSec);
    }
  } catch (err) {
    if (err.status === 429) {
      const retry = parseRetryAfterSeconds(err.headers?.get?.('retry-after'));
      introDbRateLimitedUntil = Date.now() + retry * 1000;
    }
    // 404 / network / malformed — treat as "no data", never throw.
    segments = [];
  }
  return cache.set(key, segments, CACHE_TTL_MS);
}

/** Resolve an AniList media id for a title. null on any failure. */
async function anilistIdForTitle(title) {
  const q = String(title || '').trim();
  if (!q) return null;
  const key = `anilist:${q.toLowerCase()}`;
  const cached = anilistCache.get(key);
  if (cached !== undefined) return cached;

  let id = null;
  try {
    const { data } = await postJson(ANILIST_URL, {
      query: `query ($search: String) {
        Page(perPage: 1) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
            id
          }
        }
      }`,
      variables: { search: q },
    });
    id = data?.data?.Page?.media?.[0]?.id ?? null;
  } catch {
    id = null;
  }
  return anilistCache.set(key, id, ANILIST_TTL_MS);
}

const ANISKIP_SKIPPABLE = new Set([
  'intro', 'new intro', 'credits', 'new credits', 'ending',
  'mixed intro', 'mixed credits', 'preview', 'recap', 'transition',
]);

function mapAniSkipType(typeName) {
  const n = String(typeName || '').toLowerCase();
  if (n.includes('credits') || n.includes('ending') || n.includes('outro')) return TYPE.OUTRO;
  if (n.includes('preview') || n.includes('recap')) return TYPE.RECAP;
  if (n.includes('transition')) return null; // crowdsourced noise — dropped
  return TYPE.INTRO;
}

/** AniSkip: timestamps for an AniList id + episode number. [] on any failure. */
async function aniSkipSegments({ anilistId, episode, durationSec, clientId }) {
  if (!anilistId) return [];
  const id = String(clientId || '').trim();
  if (!id) return []; // AnimeSkip asks clients to identify themselves; without one we stay out.
  const episodeN = Number.isFinite(+episode) && +episode > 0 ? Math.floor(+episode) : 1;
  const key = `aniskip:${anilistId}:${episodeN}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const headers = { 'X-Client-ID': id, Accept: 'application/json' };
  const gql = (query) => postJson(ANISKIP_URL, { query }, { headers });

  let segments = [];
  try {
    // STEP 1 — internal show id from the external (ANILIST) id
    const showRes = await gql(`query { findShowsByExternalId(service: ANILIST, serviceId: "${anilistId}") { id } }`);
    const shows = showRes?.data?.data?.findShowsByExternalId;
    if (!Array.isArray(shows) || !shows.length) throw new Error('no show');
    const showId = shows[0].id;

    // STEP 2 — episode id from show id
    const epRes = await gql(`query { findEpisodesByShowId(showId: "${showId}") { id number } }`);
    const episodes = epRes?.data?.data?.findEpisodesByShowId;
    if (!Array.isArray(episodes) || !episodes.length) throw new Error('no episodes');
    const target = episodes.find((ep) => String(ep.number) === String(episodeN));
    if (!target) throw new Error('episode not found');

    // STEP 3 — timestamps for the episode
    const tsRes = await gql(`query { findTimestampsByEpisodeId(episodeId: "${target.id}") { at type { name } } }`);
    const timestamps = tsRes?.data?.data?.findTimestampsByEpisodeId;
    if (!Array.isArray(timestamps) || !timestamps.length) throw new Error('no timestamps');

    timestamps.sort((a, b) => Number(a.at) - Number(b.at));
    const raw = [];
    for (let i = 0; i < timestamps.length; i++) {
      const current = timestamps[i];
      const typeName = String(current?.type?.name || '').toLowerCase();
      if (!ANISKIP_SKIPPABLE.has(typeName)) continue;
      const type = mapAniSkipType(typeName);
      if (!type) continue;
      const start = Number(current.at);
      let end = start + 85; // AnimeSkip's crowd default when no next timestamp exists
      if (i + 1 < timestamps.length) end = Number(timestamps[i + 1].at);
      else if (Number.isFinite(durationSec) && durationSec > 0) end = durationSec;
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      raw.push({ start, end, type });
    }
    segments = sanitizeSegments(raw, durationSec);
  } catch {
    segments = [];
  }
  return cache.set(key, segments, CACHE_TTL_MS);
}

/**
 * Segments for the episode being played. Returns [] unless the user enabled
 * skip integration in Settings. AniSkip (title-specific) replaces IntroDB
 * (crowd average) when it has data.
 */
async function segmentsForEpisode(state, { title, season, episode, durationSec } = {}) {
  const settings = state?.getSettings() || {};
  if (!settings.skipIntroOutro) return [];

  const seasonN = Number.isFinite(+season) && +season > 0 ? Math.floor(+season) : 1;
  const episodeN = Number.isFinite(+episode) && +episode > 0 ? Math.floor(+episode) : 1;
  const duration = Number.isFinite(+durationSec) && +durationSec > 0 ? +durationSec : undefined;

  // IntroDB path — needs an IMDb id, resolved via the user's TMDB key.
  let introDb = [];
  if (tmdb.hasKey(state) && title) {
    try {
      const match = await tmdb.bestMatch(state, { title });
      if (match?.imdbId) {
        introDb = await introDbSegments({ imdbId: match.imdbId, season: seasonN, episode: episodeN, durationSec: duration });
      }
    } catch {
      introDb = [];
    }
  }

  // AniSkip path — needs an AniList id (public API) and the user's client id.
  let anime = [];
  const clientId = String(settings.animeSkipClientId || '').trim();
  if (clientId && title) {
    const anilistId = await anilistIdForTitle(title);
    if (anilistId) {
      anime = await aniSkipSegments({ anilistId, episode: episodeN, durationSec: duration, clientId });
    }
  }

  if (anime.length) return anime;
  return sanitizeSegments(introDb, duration);
}

/** The segment covering `positionSec`, if any. */
function segmentAt(segments, positionSec) {
  if (!Array.isArray(segments)) return null;
  for (const seg of segments) {
    if (positionSec >= seg.start && positionSec < seg.end) return seg;
  }
  return null;
}

module.exports = {
  TYPE,
  sanitizeSegments,
  segmentAt,
  segmentsForEpisode,
  parseRetryAfterSeconds,
  // Exported for tests / diagnostics.
  _internal: { introDbSegments, aniSkipSegments, anilistIdForTitle, mapAniSkipType, ANISKIP_SKIPPABLE },
};
