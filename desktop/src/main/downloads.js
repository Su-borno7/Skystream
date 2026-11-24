'use strict';
/**
 * Skystream — download manager.
 * Direct media files (mp4/mkv/webm/mp3/…) are downloaded through the media proxy
 * (so hosts that require Referer headers still work) straight to disk with progress.
 * HLS playlists are not remuxed; they are marked 'hls' and can be played in-app instead.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_CONCURRENT = 2;
const DISPLAY_NAME_MAX = 120;

function sanitizeFileName(name) {
  return String(name || 'download')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DISPLAY_NAME_MAX) || 'download';
}

function extensionFromUrl(url, fallback = '.mp4') {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return /^\.[A-Za-z0-9]{2,5}$/.test(ext) ? ext : fallback;
  } catch {
    return fallback;
  }
}

class DownloadManager {
  constructor({ getDownloadDir, onUpdate }) {
    this.getDownloadDir = getDownloadDir;
    this.onUpdate = onUpdate || (() => {});
    this.jobs = new Map(); // id -> job
    this.active = 0;
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  enqueue({ name, url, headers, referer, proxyBase }) {
    const id = crypto.randomUUID();
    const dir = this.getDownloadDir();
    fs.mkdirSync(dir, { recursive: true });
    const safe = sanitizeFileName(name);
    let filePath = path.join(dir, safe + extensionFromUrl(url));
    if (fs.existsSync(filePath)) {
      filePath = path.join(dir, `${safe}-${id.slice(0, 8)}${extensionFromUrl(url)}`);
    }
    const job = {
      id, name: safe, url, headers: headers || (referer ? { Referer: referer } : {}),
      proxyBase, filePath, progress: 0, receivedBytes: 0, totalBytes: null,
      status: 'queued', error: null, createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.onUpdate(job);
    this._pump();
    return job;
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return { ok: false };
    job.cancelled = true;
    if (job.status === 'queued') job.status = 'cancelled';
    if (job.controller) job.controller.abort();
    this.onUpdate(job);
    this._pump();
    return { ok: true };
  }

  remove(id, { deleteFile = false } = {}) {
    const job = this.jobs.get(id);
    if (!job) return { ok: true };
    if (job.status === 'downloading') return this.cancel(id);
    this.jobs.delete(id);
    if (deleteFile && job.filePath && fs.existsSync(job.filePath)) {
      try { fs.unlinkSync(job.filePath); } catch { /* ignore */ }
    }
    this.onUpdate({ id, status: 'removed' });
    return { ok: true };
  }

  async _pump() {
    if (this.active >= MAX_CONCURRENT) return;
    const next = [...this.jobs.values()].find((j) => j.status === 'queued');
    if (!next) return;
    this.active += 1;
    next.status = 'downloading';
    this.onUpdate(next);
    try {
      await this._run(next);
    } catch (err) {
      if (next.cancelled) {
        next.status = 'cancelled';
      } else {
        next.status = 'error';
        next.error = String(err && err.message ? err.message : err);
      }
      this.onUpdate(next);
    } finally {
      this.active -= 1;
      this._pump();
    }
  }

  async _run(job) {
    const h = {};
    for (const [k, v] of Object.entries(job.headers || {})) h[k] = v;
    if (job.proxyBase && /\.m3u8(\?|$)/i.test(job.url)) {
      throw new Error('HLS playlists cannot be downloaded directly — open them in the in-app player instead.');
    }
    const controller = new AbortController();
    job.controller = controller;
    const timer = setTimeout(() => controller.abort(new Error('Download timed out')), 6 * 60 * 60 * 1000);
    try {
      const headers = Object.assign({ 'User-Agent': 'Mozilla/5.0' }, h);
      const res = await fetch(job.url, { headers, redirect: 'follow', signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length') || 0) || null;
      job.totalBytes = total;
      const file = fs.createWriteStream(job.filePath);
      const reader = res.body.getReader();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (job.cancelled) throw new Error('cancelled');
        file.write(Buffer.from(value));
        received += value.byteLength;
        job.receivedBytes = received;
        job.progress = total ? received / total : 0;
        if (received % (512 * 1024) < value.byteLength) this.onUpdate(job);
      }
      await new Promise((resolve, reject) => { file.on('finish', resolve); file.on('error', reject); file.end(); });
      job.status = 'done';
      job.progress = 1;
      this.onUpdate(job);
    } finally {
      clearTimeout(timer);
      job.controller = null;
    }
  }
}

module.exports = { DownloadManager, sanitizeFileName };
