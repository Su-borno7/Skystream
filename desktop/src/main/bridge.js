'use strict';
/**
 * Skystream — main-process side of the Java bridge.
 *
 * The bridge is a small JVM program (see bridge/) that loads CloudStream `.cs3`
 * extensions (dex → jar translation, JVM build of the extension API, stubbed
 * Android classes) and answers JSON calls over loopback HTTP.
 *
 * The Electron app talks to it at http://127.0.0.1:<port>. If Java or the bridge
 * payload is missing, every call returns a structured error and the rest of the
 * app keeps working (repository management, downloads, library are unaffected).
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BRIDGE_MAIN_CLASS = 'com.skystream.bridge.Main';

class Bridge {
  /**
   * @param {object} opts
   *   resourcesPath: process.resourcesPath equivalent (electron app.getPath('exe') dir fallback for dev)
   *   devBridgeDir:  optional path to a gradle installDist folder (dev builds)
   *   userDataDir:   for logs + caches passed to the bridge
   *   onLog: (line) => void
   */
  constructor({ resourcesPath, devBridgeDir, userDataDir, onLog }) {
    this.resourcesPath = resourcesPath;
    this.devBridgeDir = devBridgeDir || null;
    this.userDataDir = userDataDir;
    this.onLog = onLog || (() => {});
    this.proc = null;
    this.port = null;
    this.ready = false;
    this.lastError = null;
    this._readyPromise = null;
    this.logs = [];
  }

  _log(line) {
    const text = String(line).replace(/\n$/, '');
    this.logs.push(text);
    if (this.logs.length > 500) this.logs.shift();
    this.onLog(text);
  }

  /** Locate a Java runtime: bundled JRE (packaged app), else JAVA_HOME, else PATH. */
  findJava() {
    const bundled = path.join(this.resourcesPath, 'jre');
    const exe = process.platform === 'win32' ? 'java.exe' : 'java';
    const unixBundled = path.join(bundled, 'bin', exe);
    if (fs.existsSync(unixBundled)) return unixBundled;
    if (process.env.JAVA_HOME) {
      const p = path.join(process.env.JAVA_HOME, 'bin', exe);
      if (fs.existsSync(p)) return p;
    }
    const probe = spawnSync(exe, ['-version'], { stdio: 'ignore' });
    if (probe.status === 0) return exe;
    return null;
  }

  /** Locate the bridge payload: {libDir} with *.jar files. */
  findBridgeLib() {
    const candidates = [];
    if (this.devBridgeDir) candidates.push(path.join(this.devBridgeDir, 'lib'));
    candidates.push(path.join(this.resourcesPath, 'bridge', 'lib'));
    candidates.push(path.join(this.resourcesPath, 'app.asar.unpacked', 'bridge', 'lib'));
    for (const dir of candidates) {
      try {
        if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.jar'))) return dir;
      } catch { /* keep looking */ }
    }
    return null;
  }

  status() {
    return {
      java: !!this.findJava(),
      bridgePayload: !!this.findBridgeLib(),
      running: !!this.proc && this.ready,
      port: this.port,
      lastError: this.lastError,
    };
  }

  /** Start the bridge process; resolves to true when it reports SKYSTREAM_PORT. */
  start() {
    if (this._readyPromise) return this._readyPromise;
    this._readyPromise = new Promise((resolve) => {
      const java = this.findJava();
      const libDir = this.findBridgeLib();
      if (!java) {
        this.lastError = 'No Java runtime found. Install Java 17+ or use an official Skystream build (bundles Java).';
        this._log('bridge: ' + this.lastError);
        return resolve(false);
      }
      if (!libDir) {
        this.lastError = 'Bridge payload not found (bridge/lib/*.jar missing). Build it with bridge/build.gradle.kts or use an official Skystream build.';
        this._log('bridge: ' + this.lastError);
        return resolve(false);
      }
      const classpath = path.join(libDir, '*');
      const cacheDir = path.join(this.userDataDir, 'bridge-cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const args = [
        '-Dfile.encoding=UTF-8',
        '-Djava.awt.headless=true',
        // Plugin bytecode comes from dex2jar and may reference Android classes we only stub.
        '-XX:+UnlockDiagnosticVMOptions',
        '-XX:-BytecodeVerificationRemote',
        '-Xmx512m',
        `-Dskystream.cache.dir=${cacheDir}`,
        '-cp', classpath,
        BRIDGE_MAIN_CLASS,
        this.userDataDir,
      ];
      this._log(`bridge: launching (${java})`);
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      const timer = setTimeout(() => {
        this.lastError = 'Bridge did not report its port within 60s';
        this._log('bridge: ' + this.lastError);
        done(false);
      }, 60000);
      try {
        this.proc = spawn(java, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        this.lastError = String(err);
        this._log('bridge: spawn failed: ' + this.lastError);
        clearTimeout(timer);
        return done(false);
      }
      const onData = (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) {
          if (!line.trim()) continue;
          this._log(line);
          const match = /SKYSTREAM_PORT=(\d+)/.exec(line);
          if (match) {
            this.port = Number(match[1]);
            this.ready = true;
            this.lastError = null;
            clearTimeout(timer);
            done(true);
          }
        }
      };
      this.proc.stdout.on('data', onData);
      this.proc.stderr.on('data', onData);
      this.proc.on('exit', (code) => {
        this._log(`bridge: exited with code ${code}`);
        this.ready = false;
        this.proc = null;
        if (!settled) {
          this.lastError = `Bridge exited early (code ${code}). See logs.`;
          clearTimeout(timer);
          done(false);
        }
        this._readyPromise = null; // allow restart
      });
      this.proc.on('error', (err) => {
        this.lastError = String(err);
        this._log('bridge: ' + this.lastError);
        clearTimeout(timer);
        done(false);
      });
    });
    return this._readyPromise;
  }

  stop() {
    if (this.proc) {
      try { this.proc.kill('SIGTERM'); } catch { /* already gone */ }
      this.proc = null;
    }
    this.ready = false;
    this.port = null;
    this._readyPromise = null;
  }

  async _request(method, route, body, { timeout = 60000 } = {}) {
    if (!this.ready || !this.port) {
      const started = await this.start();
      if (!started) throw new Error(this.lastError || 'Bridge unavailable');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Bridge request timed out')), timeout);
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}${route}`, {
        method,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
      if (!res.ok) {
        const message = (json && (json.error || json.message)) || `Bridge HTTP ${res.status}`;
        throw new Error(message);
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  health() { return this._request('GET', '/health', null, { timeout: 5000 }); }

  /** Replace the loaded plugin set. Returns { providers, failed }. */
  async reloadPlugins(plugins) {
    return this._request('POST', '/reload', { plugins }, { timeout: 180000 });
  }

  providers() { return this._request('GET', '/providers', null, { timeout: 15000 }); }

  home(providerInternalName, page = 1) { return this._request('POST', '/home', { provider: providerInternalName, page }, { timeout: 60000 }); }

  search(query, providerInternalName, page = 1) { return this._request('POST', '/search', { query, provider: providerInternalName, page }, { timeout: 60000 }); }

  load(providerInternalName, url) { return this._request('POST', '/load', { provider: providerInternalName, url }, { timeout: 60000 }); }

  loadLinks(providerInternalName, data, episode) { return this._request('POST', '/loadlinks', { provider: providerInternalName, data, episode: episode == null ? null : String(episode) }, { timeout: 120000 }); }
}

module.exports = { Bridge };
