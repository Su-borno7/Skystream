'use strict';
/* ═══════════ Skystream website — interactions ═══════════ */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ───────── background: blue sky + drifting white clouds (pure CSS in style.css) ───────── */

/* ───────── nav scroll + mobile menu + scroll progress ───────── */
(function chrome() {
  const nav = document.getElementById('nav');
  const progress = document.getElementById('scrollProgress');
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 24);
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('mobileMenu');
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });
  menu.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
  });
})();

/* ───────── reveal on scroll ───────── */
(function reveal() {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));
})();

/* ───────── animated counters ───────── */
(function counters() {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      const target = Number(el.dataset.count || 0);
      const suffix = el.dataset.suffix || '';
      const dur = 1400, start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const ease = 1 - Math.pow(2, -10 * p);
        el.textContent = Math.round(target * (p === 1 ? 1 : ease)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      io.unobserve(el);
    }
  }, { threshold: 0.6 });
  $$('[data-count]').forEach((el) => io.observe(el));
})();

/* ───────── marquee (duplicate track for seamless loop) ───────── */
(function marquee() {
  const track = document.getElementById('marqueeTrack');
  track.innerHTML += track.innerHTML;
})();

/* ───────── toast ───────── */
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

/* ───────── feature grid ───────── */
(function features() {
  const grid = document.getElementById('featureGrid');
  const icon = (paths) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const data = [
    { t: 'No ads, no account, no tracking', d: 'Skystream is a media centre, not a business model. Zero ads, zero analytics, zero telemetry — your data lives on your device.', i: '<path d="M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6l-8-4Z"/><path d="m9.5 12 2 2 3.5-4"/>' },
    { t: 'CloudStream ecosystem', d: 'The exact same .cs3 extensions and repo.json repositories — if it works in CloudStream, it works in Skystream.', i: '<path d="M4 7l8-4 8 4-8 4-8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>' },
    { t: 'Movies · Series · Anime', d: 'Browsing, search, detail pages, season and episode pickers — everything you expect from a modern streaming app.', i: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5v-7Z"/>' },
    { t: 'Your library, resumed', d: 'Bookmarks and "continue watching" with per-episode progress. Pick up exactly where you left off — on any screen.', i: '<path d="M6 3h12v18l-6-4.5L6 21V3Z"/>' },
    { t: 'Downloads queue', d: 'Save direct media files to your device with a managed queue — pause, resume, retry, and watch offline.', i: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>' },
    { t: 'Android + PC, one codebase of taste', d: 'A native Android app and an Electron desktop app that share the same look, the same engine and the same extensions.', i: '<rect x="2" y="4" width="13" height="9" rx="2"/><rect x="17" y="10" width="5" height="11" rx="1.4"/>' },
    { t: 'Glass & Inter', d: 'A Shiopa-inspired frosted Glass theme, four themes in all, and Inter type everywhere. Sky-cyan accents, zero clutter.', i: '<path d="M12 2l2.4 5.3 5.8.6-4.4 3.9 1.2 5.7L12 15.4 7 17.5l1.2-5.7-4.4-3.9 5.8-.6L12 2Z"/>' },
    { t: '100% open source', d: 'GPL-3.0, reproducible public release builds, and a public in-repo keystore. Audit everything — fork it if you want.', i: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4"/>' },
  ];
  grid.innerHTML = data.map((f) => `
    <div class="feature-card reveal">
      <div class="feature-icon">${icon(f.i)}</div>
      <h3>${f.t}</h3>
      <p>${f.d}</p>
    </div>`).join('');
  // pointer-tracking glow
  grid.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.feature-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
  });
})();

/* ───────── repository data (all URLs verified live against GitHub) ───────── */
const REPOS = [
  /* ── Bangla ── */
  { tab: 'bn', mono: 'RJ', cls: 'mono-bn', name: "Redowan's BDIX", desc: 'BDIX-focused repository — Bangladeshi live TV, Bangla movies & series, BanglaPlex and 9kMovies (Bangla/Hindi). Works even during internet shutdowns.', plugins: 18, tags: ['BDIX', 'Live TV', 'Bangla'], url: 'https://raw.githubusercontent.com/redowan99/Redowan-CloudStream/master/repo.json' },
  { tab: 'bn', mono: 'SH', cls: 'mono-bn', name: "Shimul's BDIX Repo", desc: 'A fast, reliable repository curated for Bangladeshi sites — BanglaPlex, CTGMovies, CineFreak, FMFTP and MovieBox.', plugins: 9, tags: ['Bangla', 'Movies', 'Series'], url: 'https://raw.githubusercontent.com/Hackershimul07/Cloudstream/master/repo.json' },
  /* ── English ── */
  { tab: 'en', mono: 'OF', cls: 'mono-en', name: 'CloudStream Providers', desc: 'The official repository from the CloudStream core team — core Dailymotion, YouTube and Twitch providers. The safest place to start.', plugins: 5, tags: ['Official', 'Core'], url: 'https://raw.githubusercontent.com/recloudstream/extensions/master/repo.json' },
  { tab: 'en', mono: 'MG', cls: 'mono-en', name: 'MegaRepo', desc: 'The all-in-one meta-repository — installing it wires up the mega collection of community repositories in one shot.', plugins: 1, tags: ['Meta', 'Everything'], url: 'https://raw.githubusercontent.com/self-similarity/MegaRepo/builds/repo.json' },
  { tab: 'en', mono: 'PH', cls: 'mono-en', name: 'Phisher Repository', desc: '88 extensions in one repo — AnimePahe, HDhub4u, Hindi-dubbed anime, Bollywood and regional Indian cinema, YTS, sports and live TV.', plugins: 88, tags: ['Anime', 'Movies', 'Sports'], url: 'https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/repo.json' },
  /* ── Hindi ── */
  { tab: 'hi', mono: 'CX', cls: 'mono-hi', name: 'CSX / Megix', desc: 'Hindi & English specialist — CineStream (one-stop movies/series/torrents), Bollyflix, MoviesDrive, Moviesmod and VegaMovies up to 4K.', plugins: 5, tags: ['Hindi', '4K', 'Bollywood'], url: 'https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/CS.json' },
  { tab: 'hi', mono: 'CN', cls: 'mono-hi', name: 'CNCVerse', desc: 'All-language Indian hub — 46 extensions covering Hindi, Tamil, Telugu and more, including Netflix/Hotstar-style mirrors and live TV.', plugins: 46, tags: ['All India', 'Live TV', 'Regional'], url: 'https://raw.githubusercontent.com/NivinCNC/CNCVerse-Cloud-Stream-Extension/refs/heads/builds/CNC.json' },
  { tab: 'hi', mono: 'PH', cls: 'mono-hi', name: 'Phisher (Hindi)', desc: 'The Hindi-leaning slice of Phisher — AnimeDekho, Animedubhindi, HDhub4u and dozens of regional providers, actively maintained.', plugins: 88, tags: ['Hindi Dub', 'Anime', 'Regional'], url: 'https://raw.githubusercontent.com/phisher98/HindiProviders/builds/repo.json' },
];

const repoGrid = document.getElementById('repoGrid');
const repoEmpty = document.getElementById('repoEmpty');
let activeTab = 'bn';
let query = '';

function renderRepos() {
  const q = query.trim().toLowerCase();
  let shown = 0;
  repoGrid.innerHTML = REPOS
    .filter(r => r.tab === activeTab)
    .filter(r => !q || [r.name, r.desc, r.tags.join(' '), r.url].join(' ').toLowerCase().includes(q))
    .map(r => {
      shown++;
      return `
      <article class="repo-card">
        <div class="repo-top">
          <div class="repo-mono ${r.cls}">${r.mono}</div>
          <div>
            <div class="repo-name">${r.name}</div>
            <div class="repo-plugins">${r.plugins} extension${r.plugins === 1 ? '' : 's'} · community</div>
          </div>
        </div>
        <p class="repo-desc">${r.desc}</p>
        <div class="repo-tags">${r.tags.map(t => `<span>${t}</span>`).join('')}</div>
        <div class="repo-url" title="${r.url}">${r.url}</div>
        <div class="repo-actions">
          <button class="btn btn-ghost" data-copy="${r.url}">Copy link</button>
          <a class="btn btn-accent" href="cloudstreamrepo://${r.url}">Open in app</a>
        </div>
      </article>`;
    }).join('');
  repoEmpty.hidden = shown !== 0;
}

$$('.repo-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    $$('.repo-tab').forEach((t) => {
      const active = t === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    renderRepos();
  });
});

const searchInput = document.getElementById('repoSearch');
searchInput.addEventListener('input', () => { query = searchInput.value; renderRepos(); });
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.blur();
  }
});

repoGrid.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const url = btn.dataset.copy;
  try {
    await navigator.clipboard.writeText(url);
    toast('Repository link copied to clipboard');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Repository link copied to clipboard');
  }
});

renderRepos();

/* ───────── feature cards need reveal re-scan (they are injected) ───────── */
(function observeFeatures() {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  $$('.feature-card').forEach((el) => io.observe(el));
})();

/* ───────── FAQ accordion ───────── */
const FAQ = [
  { q: 'Is Skystream really free?', a: 'Yes — completely. Skystream is GPL-3.0 open source, built by volunteers. There is no paid tier, no account, no subscription and no ads. The code, the release keystore and every build step are public.' },
  { q: 'Where do the movies come from?', a: 'Nowhere — Skystream does not ship, host or endorse any content source. It is a media centre that runs third-party extensions you choose to install. You are responsible for the sources you add and for complying with your local laws.' },
  { q: 'Is Skystream affiliated with CloudStream?', a: 'No. Skystream is an independent fork/alternative built around the same extension ecosystem (same .cs3 packages, same repo.json format). It is not affiliated with or endorsed by the CloudStream project or its authors.' },
  { q: 'Android says “unknown app” when I install the APK — is it safe?', a: 'That warning appears for every sideloaded APK. Skystream APKs are signed with the public in-repo keystore (android/keystore), so you can verify the signature, and public CI builds the exact APK you download. If in doubt, build it yourself from source — the steps are in the README.' },
  { q: 'How do I add a repository?', a: 'In the app: Settings → Extensions → Repositories → Add repository, then paste a repo.json link (grab one from the Repositories section above — “Open in app” does it for you). Then enable the extensions you like.' },
  { q: 'How do updates work?', a: 'Android: Skystream checks GitHub for android-v* releases and updates itself in-app — 1.0.2 fixes a bug where it kept offering the same update. PC: Settings → About → “Check for updates” tells you when a new desktop release is out. Both platforms otherwise stay completely silent.' },
  { q: 'Which platforms are supported?', a: 'Android phones and tablets (the APK), Windows 10/11 and any modern x86_64 Linux distro (AppImage). macOS can be built locally from source — see the README. iOS and TV boxes are not supported yet.' },
  { q: 'Will Skystream ever know what I watch?', a: 'No. There is no telemetry of any kind — no analytics SDK, no crash reporter, no account server. Your library, progress and history never leave your device.' },
];

(function faq() {
  const list = document.getElementById('faqList');
  list.innerHTML = FAQ.map((item, i) => `
    <div class="faq-item${i === 0 ? ' open' : ''}">
      <button class="faq-q" aria-expanded="${i === 0}">${item.q}
        <svg class="faq-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <div class="faq-a"><p>${item.a}</p></div>
    </div>`).join('');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.faq-q');
    if (!btn) return;
    const item = btn.closest('.faq-item');
    item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(item.classList.contains('open')));
  });
})();

/* ───────── PC download highlight wiring ───────── */
(function highlightPc() {
  $$('[data-highlight]').forEach((link) => {
    link.addEventListener('click', () => {
      const card = document.getElementById(link.dataset.highlight);
      if (!card) return;
      setTimeout(() => {
        card.classList.remove('flash');
        void card.offsetWidth;
        card.classList.add('flash');
      }, 350);
    });
  });
})();

/* ───────── live GitHub release metadata ───────── */
const RELEASES_API = 'https://api.github.com/repos/Su-borno7/Skystream/releases?per_page=15';
const byName = (name) => document.getElementById(name);
const fmtSize = (bytes) => (bytes / (1024 * 1024)).toFixed(1) + ' MB';

async function loadReleases() {
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const releases = await res.json();

    const androidRel = releases.find(r => !r.prerelease && typeof r.tag_name === 'string' && r.tag_name.startsWith('android-v'));
    if (androidRel) {
      const apk = (androidRel.assets || []).find(a => a.name.endsWith('.apk'));
      byName('androidVersion').textContent = 'v' + androidRel.tag_name.replace('android-v', '');
      if (apk) {
        byName('androidSize').textContent = fmtSize(apk.size);
        byName('androidDownload').href = apk.browser_download_url;
      } else {
        byName('androidDownload').href = androidRel.html_url;
      }
    }

    const desktopRel = releases.find(r => !r.prerelease && typeof r.tag_name === 'string' && r.tag_name.startsWith('desktop-v'));
    if (desktopRel) {
      const dVersion = 'v' + desktopRel.tag_name.replace('desktop-v', '');
      const win = (desktopRel.assets || []).find(a => a.name.endsWith('.exe'));
      const lin = (desktopRel.assets || []).find(a => a.name.endsWith('.AppImage'));
      byName('windowsVersion').textContent = dVersion;
      byName('linuxVersion').textContent = dVersion;
      if (win) { byName('windowsSize').textContent = fmtSize(win.size); byName('windowsDownload').href = win.browser_download_url; }
      else byName('windowsDownload').href = desktopRel.html_url;
      if (lin) { byName('linuxSize').textContent = fmtSize(lin.size); byName('linuxDownload').href = lin.browser_download_url; }
      else byName('linuxDownload').href = desktopRel.html_url;
    }
  } catch (err) {
    console.warn('Release metadata unavailable:', err);
    byName('androidVersion').textContent = 'latest';
    byName('windowsVersion').textContent = 'latest';
    byName('linuxVersion').textContent = 'latest';
  }
}
loadReleases();

/* ───────── GitHub star count ───────── */
(function stars() {
  fetch('https://api.github.com/repos/Su-borno7/Skystream', { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d || typeof d.stargazers_count !== 'number') return;
      document.getElementById('ghStarCount').textContent = String(d.stargazers_count);
      document.getElementById('ghStars').hidden = false;
    })
    .catch(() => {});
})();

/* ───────── footer year ───────── */
document.getElementById('year').textContent = String(new Date().getFullYear());
