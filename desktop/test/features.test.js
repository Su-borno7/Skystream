'use strict';
/**
 * Unit tests for the discovery & tracking modules.
 * Network-facing functions are not exercised (no network in CI) — the
 * sanitizing, caching and normalization logic is.
 */
const test = require('node:test');
const assert = require('node:assert');

const skip = require('../src/main/skip');
const tmdb = require('../src/main/tmdb');
const { LruCache } = require('../src/main/cache');
const trakt = require('../src/main/trakt');

test('sanitizeSegments swaps backwards ranges and clamps negatives', () => {
  const out = skip.sanitizeSegments([
    { start: 90, end: 30, type: 'intro' }, // backwards → swapped
    { start: -10, end: 50, type: 'intro' }, // negative start → 0
  ], 600);
  assert.deepStrictEqual(out, [
    { start: 0, end: 50, type: 'intro' },
    { start: 30, end: 90, type: 'intro' },
  ]);
});

test('sanitizeSegments drops zero-length, sub-second and unknown-type segments', () => {
  const out = skip.sanitizeSegments([
    { start: 10, end: 10.4, type: 'intro' }, // <1s → dropped
    { start: 20, end: 20.9, type: 'intro' }, // <1s → dropped
    { start: 30, end: 60, type: 'unknown' }, // unknown → dropped
    { start: 40, end: 90, type: 'something-else' }, // unknown → dropped
    { start: 100, end: 160, type: 'outro' }, // valid
  ], 300);
  assert.deepStrictEqual(out, [{ start: 100, end: 160, type: 'outro' }]);
});

test('sanitizeSegments clamps to duration and drops segments past EOF', () => {
  const out = skip.sanitizeSegments([
    { start: 500, end: 700, type: 'outro' }, // entirely past 300s EOF → dropped
    { start: 250, end: 700, type: 'outro' }, // clamped to 300
  ], 300);
  assert.deepStrictEqual(out, [{ start: 250, end: 300, type: 'outro' }]);
});

test('sanitizeSegments sorts by start time and tolerates garbage', () => {
  const out = skip.sanitizeSegments([
    { start: 200, end: 260, type: 'recap' },
    null,
    { start: 'nope', end: 50, type: 'intro' },
    { start: 0, end: 30, type: 'recap' },
  ], 400);
  assert.deepStrictEqual(out, [
    { start: 0, end: 30, type: 'recap' },
    { start: 200, end: 260, type: 'recap' },
  ]);
});

test('segmentAt returns the covering segment or null', () => {
  const segs = [
    { start: 10, end: 70, type: 'intro' },
    { start: 800, end: 900, type: 'outro' },
  ];
  assert.equal(skip.segmentAt(segs, 30)?.type, 'intro');
  assert.equal(skip.segmentAt(segs, 850)?.type, 'outro');
  assert.equal(skip.segmentAt(segs, 500), null);
  assert.equal(skip.segmentAt(null, 30), null);
});

test('parseRetryAfterSeconds defaults to 60, honours value, caps at 300', () => {
  assert.equal(skip.parseRetryAfterSeconds(undefined), 60);
  assert.equal(skip.parseRetryAfterSeconds('abc'), 60);
  assert.equal(skip.parseRetryAfterSeconds('-5'), 60);
  assert.equal(skip.parseRetryAfterSeconds('120'), 120);
  assert.equal(skip.parseRetryAfterSeconds('9999'), 300);
});

test('AniSkip type mapping matches upstream semantics', () => {
  const m = skip._internal.mapAniSkipType;
  assert.equal(m('Intro'), 'intro');
  assert.equal(m('New Intro'), 'intro');
  assert.equal(m('Credits'), 'outro');
  assert.equal(m('Ending'), 'outro');
  assert.equal(m('Preview'), 'recap');
  assert.equal(m('Recap'), 'recap');
  assert.equal(m('Transition'), null); // crowdsourced noise, dropped
});

test('LruCache evicts least-recently-used entries past capacity', () => {
  const cache = new LruCache(2);
  cache.set('a', 1, 60000);
  cache.set('b', 2, 60000);
  assert.equal(cache.get('a'), 1); // touch a → b is now LRU
  cache.set('c', 3, 60000);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('LruCache entries expire after their TTL', async () => {
  const cache = new LruCache(10);
  cache.set('x', 'y', 20);
  assert.equal(cache.get('x'), 'y');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(cache.get('x'), undefined);
});

test('tmdb normalizeItem maps movie/TV shapes to a common model', () => {
  const movie = tmdb._internal.normalizeItem(
    { id: 1, title: 'A Movie', release_date: '2024-05-01', vote_average: 8.25, poster_path: '/p.jpg', media_type: 'movie' },
  );
  assert.equal(movie.mediaType, 'movie');
  assert.equal(movie.name, 'A Movie');
  assert.equal(movie.year, '2024');
  assert.equal(movie.rating, 8.3);
  assert.match(movie.posterUrl, /image\.tmdb\.org\/t\/p\/w500\/p\.jpg$/);

  const show = tmdb._internal.normalizeItem(
    { id: 2, name: 'A Show', first_air_date: '2022-01-01', genre_ids: [] },
    'tv',
  );
  assert.equal(show.mediaType, 'tv');
  assert.equal(show.name, 'A Show');
  assert.equal(show.year, '2022');
  assert.equal(show.posterUrl, null);
});

test('tmdb list paths route TV section names correctly', () => {
  const p = tmdb._internal.LIST_PATHS;
  assert.equal(p.trending('tv'), '/trending/tv/week');
  assert.equal(p.popular('movie'), '/movie/popular');
  assert.equal(p.nowPlaying('movie'), '/movie/now_playing');
  assert.equal(p.nowPlaying('tv'), '/tv/airing_today');
  assert.equal(p.upcoming('movie'), '/movie/upcoming');
  assert.equal(p.upcoming('tv'), '/tv/on_the_air');
  assert.equal(p.topRated('tv'), '/tv/top_rated');
});

test('trakt isExpired treats tokens inside 60s of expiry as expired', () => {
  const { isExpired } = trakt._internal;
  const now = Date.now();
  assert.equal(isExpired(null), true);
  assert.equal(isExpired({}), true);
  assert.equal(isExpired({ expiresAt: now - 1000 }), true);
  assert.equal(isExpired({ expiresAt: now + 30 * 1000 }), true); // within leeway
  assert.equal(isExpired({ expiresAt: now + 3600 * 1000 }), false);
});
