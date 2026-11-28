# Cinelab — Features

Cinelab is a free and open-source media centre for **Android** and **PC**, built around the
CloudStream extension ecosystem. No account, no subscription, no telemetry — you install
third-party `.cs3` extensions explicitly, exactly like you would in CloudStream.

Cinelab does **not** ship, host or endorse any content source.

> Cinelab is an independent project and is **not affiliated with or endorsed by** the
> CloudStream project or its authors.

---

## Shared across both apps

- **CloudStream extension ecosystem** — same `.cs3` packages, same `repo.json` repositories.
- **Movies, TV series and anime** — browsing, searching, detail pages, episodes, playback.
- **Home sections** from the extensions you enable.
- **Library** — bookmarks and "continue watching".
- **Watch progress** — per title and per episode, with resume.
- **Downloads** of direct media files.
- **Extensions manager** — add repositories, install / enable / update / remove extensions.
- **No telemetry.** All state (library, progress, settings, history) lives on your device.

---

## Cinelab for Android (`android-v1.0.5`)

A fork of [recloudstream/cloudstream](https://github.com/recloudstream/cloudstream)
(`com.cinelab.app`), rebranded to Cinelab:

- The full upstream CloudStream experience — extension repositories, plugins, home, search,
  detail pages, episode/season browser, ExoPlayer-based playback, downloads, subtitles.
- **Cinelab branding** throughout (app name, icons, colours). All app icons — Android
  launcher (adaptive + themed monochrome), TV banner, Play Store listing, splash,
  desktop installer, favicon — render the same **Première mark** (faceted champagne-gold
  plane on warm graphite), regenerated deterministically by `tools/make_icons.py`.
- **Redesigned interface** — warm graphite palette with a champagne-gold accent,
  rounded Material 3 component shapes, and **Inter** as the default typeface
  (Google Sans remains selectable); visually distinct from stock CloudStream.
- **Première** is the default theme (warm graphite + champagne gold, matching the desktop
  Première design); **Glass** remains available (frosted panels, full-capsule pills and a
  warm gold aurora backdrop).
- **In-app updater** points at `Su-borno7/Skystream` GitHub releases — installing
  `android-v*` releases delivers updates inside the app.
- Settings → About links to this repository.
- **Reproducible public release build** — signed with the public keystore committed at
  `android/keystore/cinelab-release.keystore`, so anyone can rebuild the exact signed APK
  (see `android/keystore/README.md`).
- Built and tested by GitHub Actions on every push to `android/**`; tagged `android-v*`
  releases are signed and attached automatically by `release-android.yml`.

## Cinelab for PC (`desktop-v1.0.3`)

An Electron app ("Cinelab for PC") for Windows and Linux (macOS via local build):

### Watching

- **Built-in player** — HLS via hls.js, DASH via dash.js, direct MP4 natively; source picker
  with quality-based ordering; hardware-accelerated decode (optional).
- **Protected streams** — player headers/`Referer` are routed through a loopback media proxy
  so header-gated CDNs still play.
- **Subtitles** — WebVTT tracks render in-app with configurable size and colour; non-VTT
  subtitle URLs open in the system browser.
- **Resume anywhere** — per-episode and per-title position is remembered (toggleable),
  including a "continue watching" rail on Home and in Library.
- **Skip intro & outro** — auto-seek every episode by N seconds (configurable), or skip
  crowdsourced intro/recap/outro segments (see below).
- **Autoplay next episode** on `ended` when enabled.
- **Keyboard shortcuts** — `Space`/`K` play-pause, `J`/`L` ±5 s, arrows seek, `F` fullscreen,
  `M` mute, `S` sources panel, `N` next episode, `Esc` close.

### Finding things

- **Explore** — a discovery screen powered by [TMDB](https://www.themoviedb.org): trending
  this week, popular, top-rated, now-playing and upcoming, for movies and series, with
  posters, ratings and pagination. Bring your own free TMDB API key (Settings → Explore &
  tracking) — the app ships with no baked-in key. This product uses the TMDB API but is not
  endorsed or certified by TMDB. Clicking a title searches your installed providers for it.
- **Home feed** populated from the home pages of your enabled providers, with skeleton
  loading and per-provider error reporting.
- **Universal search** across all enabled providers at once; provider scope chips (persisted)
  to narrow it; per-provider failure isolation; "Load more" pagination; search history with
  one-click removal.
- **Rich detail pages** — hero backdrop, year / duration / content rating / score, tags,
  plot, cast, recommendations, episode browser with season selector and watched markers.

### Discovery & tracking (optional, your own keys)

- **Skip intro / recap / outro** — while playing an episode, Cinelab fetches crowdsourced
  skip segments and shows a one-tap **Skip** button (or auto-seeks, your choice). Sources:
  [IntroDB](https://api.introdb.app) (needs the TMDB key to resolve IMDb ids) and, for anime,
  [AnimeSkip](https://anime-skip.com) (needs an AniList id — resolved automatically — plus
  your own AnimeSkip client ID; AniSkip data replaces IntroDB's when present, matching
  upstream semantics). Empty results and rate limits are cached/honoured; playback is never
  blocked by a missing segment.
- **Trakt scrobbling** — finished movies and episodes are reported to your Trakt history
  (`/scrobble/stop`) when signed in. Sign in from Settings → Explore & tracking using the
  device-authorization flow: you register a free Trakt API app at
  [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications), paste its Client ID and
  Secret, and approve the code at trakt.tv/activate. Tokens live in a separate on-device
  secrets store (never in settings export) and refresh automatically. Titles are matched to
  TMDB ids best-effort via your TMDB key — scrobbling is skipped silently when no confident
  match exists. Cinelab has no account of its own and no telemetry.
- **No baked-in credentials** — TMDB, AnimeSkip and Trakt are all bring-your-own-key;
  nothing shared ships in the installer.

### Your data

- **Library** — bookmarks plus continue-watching, with poster cards and a one-click clear.
- **Downloads queue** — direct (non-HLS) media files; cancel, remove, "clear finished",
  open containing folder. Progress is saved locally.
- **Search history** — stored locally, removable per-entry or cleared with the list.

### Managing extensions

- **Extensions manager** built in: browse a built-in catalogue (verified sources first,
  community sources labelled), paste any `repo.json` URL, and install / enable / disable /
  update / remove extensions.
- **Reload into the bridge without restarting** — extensions are re-applied on enable,
  update, removal or launch.
- **jsDelivr proxy** option for GitHub-hosted repositories.
- **Auto-update extensions on launch** (optional).
- **Filter** the catalogue/installed list by name, repo, or type; "installed only" toggle.

### Appearance & behaviour

- Theme (**Première** default / **Dark** / **Noir** / **Linen**), **accent colour** palette
  (defaults to champagne gold), bundled **Inter** typeface; top command bar navigation,
  grid poster walls, editorial hero banner — visually distinct from stock CloudStream.
- **Reduce motion** (accessibility), **hardware acceleration** toggle.
- Default quality (Auto / Highest / Lowest), skip-intro seconds, autoplay next episode,
  remember position.
- Subtitle size and colour for WebVTT tracks.
- Download folder chooser; app data location shown in Settings.
- Frameless custom title bar with minimize / maximize / close.
- No telemetry; settings, library, progress and history are stored as JSON in the OS
  config directory (written atomically).

### Why it needs the bridge

`.cs3` extensions contain Android dex bytecode. The bundled **JVM bridge**
(`bridge/`) translates dex → jar at first load (cached), compiles the upstream CloudStream
library to the JVM, and exposes the extension as a loopback HTTP API the app talks to.
Official installers **bundle a Temurin JRE 21**, so no separate Java install is required;
from source, a system Java 21+ is used instead. The bridge is started on demand and probed
over loopback; a stale bridge never leaves the UI hanging.

---

## The bridge (`bridge/`) — how `.cs3` extensions run on PC

- Parses `.cs3` packages and translates dex bytecode back to Java bytecode (dex2jar-style,
  cached under `<userData>/bridge-cache`).
- Compiles the upstream CloudStream `library` module for the JVM — Android-only APIs are
  replaced by headless shims.
- Loads extensions in-process and serves a small loopback HTTP API:
  `/health`, `/providers`, `/home`, `/search`, `/load`, `/loadlinks`.
- Failures are isolated per extension — a broken plugin shows an error row instead of
  taking down the app. The renderer always degrades gracefully ("Bridge offline" guidance,
  retry button) when the sidecar is unavailable.
- Verified in CI: full `:app:installDist` build plus a health-endpoint smoke test on every
  push to `bridge/**`.

### Known limits

- WebView-based providers are constrained by headless shims.
- HLS streams play in-app but are **not** downloadable (direct files only).
- Subtitle rendering in the player is WebVTT-only.
- Extensions execute third-party code — install only repositories you trust.

## Deliberately missing

- No Cinelab account, cloud sync service, or telemetry. Optional third-party sign-ins
  (Trakt) use your own API app and credentials.
- No content bundled or endorsed; extensions are third-party.
- Desktop installers are unsigned (Windows SmartScreen will warn on first run);
  Android APKs are signed with the committed public keystore.

## Prior art & credits

The skip-segment design (IntroDB/AniSkip sources, cache semantics, segment sanitizing) was
ported as a re-implementation from [akashdh11's Cinelab](https://github.com/akashdh11/cinelab)
(GPL-3.0). No upstream code was copied; the desktop app talks to the same public HTTP APIs.
TMDB artwork is © TMDB and used under their terms — always load live from image.tmdb.org.

## Where to get it

| Platform | Latest | Artifact (current published file names) |
|----------|--------|----------|
| Android  | [`android-v1.0.5`](https://github.com/Su-borno7/Skystream/releases/tag/android-v1.0.5) | `Skystream-1.0.5-android.apk` |
| Linux    | [`desktop-v1.0.3`](https://github.com/Su-borno7/Skystream/releases/tag/desktop-v1.0.3) | `Skystream-1.0.3-linux-x86_64.AppImage` |
| Windows  | [`desktop-v1.0.3`](https://github.com/Su-borno7/Skystream/releases/tag/desktop-v1.0.3) | `Skystream-1.0.3-win-x64.exe` |

> **Rename note:** the project was rebranded *Skystream → Cinelab*. The published
> `android-v1.0.5` / `desktop-v1.0.3` releases were built from the pre-rename
> commit — the APKs and installers in them keep the historical `Skystream-*` file
> names and the pre-rename `com.skystream.app` identity. From the next release,
> Android's applicationId is `com.cinelab.app` and CI produces `Cinelab-*`
> artifacts.
