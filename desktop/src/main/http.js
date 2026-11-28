'use strict';
/**
 * Thin HTTP helpers used by the extension/repository system.
 * Uses the global fetch (undici) so it can also run under plain `node --test`.
 */

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_JSON_BYTES = 32 * 1024 * 1024; // 32 MB guard
const MAX_PLUGIN_BYTES = 128 * 1024 * 1024; // .cs3 files are small; guard anyway

const DESKTOP_UA =
  'Cinelab/1.0.0 (+https://github.com/Su-borno7/Skystream)';

async function _fetch(url, { timeout = DEFAULT_TIMEOUT_MS, headers = {}, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeout}ms`)), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect,
      headers: Object.assign({ 'User-Agent': DESKTOP_UA, Accept: '*/*' }, headers),
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, { timeout, headers } = {}) {
  const res = await _fetch(url, { timeout, headers });
  const text = await res.text();
  if (text.length > MAX_JSON_BYTES) throw new Error(`Response too large from ${url}`);
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(`Invalid JSON from ${url}: ${err.message}`);
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    err.body = data;
    err.headers = res.headers;
    throw err;
  }
  return data;
}

async function fetchBuffer(url, { timeout, headers, maxBytes = MAX_PLUGIN_BYTES } = {}) {
  const res = await _fetch(url, { timeout, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const chunks = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw new Error(`Response too large from ${url}`);
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Cloudstream-style repo URL coercion (mirrors the Android app's parseRepoUrl). */
function normalizeRepoUrl(input) {
  const fixed = String(input || '').trim();
  if (!fixed) return null;
  if (/^https?:\/\//i.test(fixed)) return fixed;
  const shortcut = fixed.replace(/^(cloudstreamrepo:\/\/|https:\/\/cs\.repo\/\\?\??)/i, '');
  if (shortcut !== fixed) {
    if (/^https?:\/\//i.test(shortcut)) return shortcut;
    return 'https://' + shortcut.replace(/^\/+/, '');
  }
  return 'https://' + fixed.replace(/^\/+/, '');
}

/** POST a JSON body, parse the JSON response. Used by AniList/AnimeSkip/Trakt GraphQL & OAuth endpoints. */
async function postJson(url, body, { timeout, headers = {}, acceptedStatuses = [] } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeout || DEFAULT_TIMEOUT_MS}ms`)), timeout || DEFAULT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      redirect: 'follow',
      headers: Object.assign({ 'User-Agent': DESKTOP_UA, Accept: 'application/json', 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (text.length > MAX_JSON_BYTES) throw new Error(`Response too large from ${url}`);
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(`Invalid JSON from ${url}: ${err.message}`);
  }
  if (!res.ok && !acceptedStatuses.includes(res.status)) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    err.body = data;
    err.headers = res.headers;
    throw err;
  }
  return { status: res.status, data, headers: res.headers };
}

module.exports = { fetchJson, postJson, fetchBuffer, normalizeRepoUrl, DESKTOP_UA };
