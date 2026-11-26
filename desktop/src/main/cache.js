'use strict';
/**
 * Tiny in-memory LRU cache with per-entry TTL.
 * Shared by the TMDB, skip-segment and Trakt modules.
 */
class LruCache {
  constructor(max = 500) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // LRU touch.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value);
    }
    return value;
  }

  clear() {
    this.map.clear();
  }
}

module.exports = { LruCache };
