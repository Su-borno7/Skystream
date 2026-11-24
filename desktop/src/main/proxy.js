'use strict';
/**
 * Skystream — loopback media proxy.
 *
 * Streaming hosts frequently require Referer/Origin headers and serve HLS
 * playlists whose segments only work from the playlist's context. Browsers
 * forbid setting those on <video>, so all media goes through
 * http://127.0.0.1:<port>/media?u=<url>&h=<base64url(json headers)>.
 *
 * - streams (mp4/mkv/dash/…): piped with Range support (seeking works)
 * - HLS playlists: fetched whole, rewritten so every segment/key/map URL is
 *   itself proxied (relative URLs resolved against the playlist URL)
 */
const http = require('http');

function proxify(url, headersB64) {
  return `/media?u=${encodeURIComponent(url)}${headersB64 ? `&h=${headersB64}` : ''}`;
}

function isPlaylistContent(contentType, target) {
  if (/mpegurl|x-mpegurl/i.test(contentType || '')) return true;
  return /\.m3u8(\?|$)/i.test(target || '');
}

function filterResponseHeaders(upstream, { playlist } = {}) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };
  const copy = [
    'content-type', 'content-length', 'accept-ranges', 'content-range',
    'etag', 'last-modified', 'content-disposition',
  ];
  for (const name of copy) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  if (playlist) {
    headers['content-type'] = 'application/vnd.apple.mpegurl';
    delete headers['content-length'];
  }
  return headers;
}

class MediaProxy {
  constructor() {
    this.server = null;
    this.port = null;
  }

  start() {
    if (this.server) return Promise.resolve(this.port);
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this._handle(req, res).catch((err) => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Upstream error: ${err && err.message ? err.message : err}`);
        });
      });
      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve(this.port);
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = null;
    }
  }

  urlFor(target, headers) {
    const h = headers && Object.keys(headers).length
      ? Buffer.from(JSON.stringify(headers)).toString('base64url')
      : '';
    return `http://127.0.0.1:${this.port}${proxify(target, h)}`;
  }

  async _handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/media') return this._serveMedia(req, res, url);
    if (url.pathname === '/ping') { res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return res.end('ok'); }
    res.writeHead(404); res.end('not found');
  }

  async _serveMedia(req, res, url) {
    const target = url.searchParams.get('u');
    if (!target || !/^https?:\/\//i.test(target)) {
      res.writeHead(400); return res.end('invalid url');
    }
    const headersB64 = url.searchParams.get('h') || '';
    let headers = {};
    if (headersB64) {
      try { headers = JSON.parse(Buffer.from(headersB64, 'base64url').toString('utf8')); } catch { headers = {}; }
    }
    if (req.headers.range) headers.Range = req.headers.range;
    if (!headers['User-Agent'] && !headers['user-agent']) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    }

    const upstream = await fetch(target, { headers, redirect: 'follow', signal: AbortSignal.timeout(45000) });

    if (isPlaylistContent(upstream.headers.get('content-type'), target)) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, target, headersB64);
      res.writeHead(upstream.status === 200 ? 200 : upstream.status, filterResponseHeaders(upstream, { playlist: true }));
      return res.end(rewritten);
    }

    res.writeHead(upstream.status, filterResponseHeaders(upstream));
    if (!upstream.body) return res.end();
    // web stream -> node response
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
    } finally {
      res.end();
    }
  }
}

/** Rewrite an m3u8 so every referenced URL goes through the proxy again. */
function rewritePlaylist(text, baseUrl, headersB64) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { out.push(line); continue; }
    if (trimmed.startsWith('#')) {
      if (/URI="/.test(line)) {
        out.push(line.replace(/URI="([^"]+)"/g, (_, uri) => {
          try { return `URI="${proxify(new URL(uri, baseUrl).href, headersB64)}"`; } catch { return `URI="${uri}"`; }
        }));
      } else {
        out.push(line);
      }
      continue;
    }
    try {
      out.push(proxify(new URL(trimmed, baseUrl).href, headersB64));
    } catch {
      out.push(line);
    }
  }
  return out.join('\n');
}

module.exports = { MediaProxy, rewritePlaylist, proxify };
