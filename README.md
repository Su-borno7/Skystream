# Cinelab

![Cinelab banner](docs/banner.png)

**Cinelab is a free and open-source media centre** for Android and PC, built around the
CloudStream extension ecosystem. It plays movies, TV series and anime from community
extensions, with no account and no subscription.

Cinelab does **not** ship, host or endorse any content source. Extensions are
third-party, GPL-compatible `.cs3` packages that you install explicitly — exactly like
CloudStream. See [NOTICE.md](NOTICE.md) for attribution and licensing.

> Cinelab is an independent project and is **not affiliated with or endorsed by** the
> CloudStream project or its authors.

## Project layout

| Path       | What it is |
|------------|------------|
| `android/` | Fork of [recloudstream/cloudstream](https://github.com/recloudstream/cloudstream), rebranded to Cinelab (`com.cinelab.app`). |
| `desktop/` | New Electron app for Windows / Linux / macOS — the "Cinelab for PC" experience. |
| `bridge/`  | JVM sidecar that makes Android `.cs3` extensions run on PC (dex → jar translation, JVM build of the extension API, Android class shims). |
| `docs/`    | Banner/icon assets. |
| `tools/`   | Asset generation scripts. |

## Features

- **CloudStream extension support, on PC.** The desktop app installs the same `.cs3`
  extensions from the same `repo.json` repositories the Android app uses.
- Home sections, scoped search across providers, rich detail pages (movies, TV series,
  anime) with episodes, seasons, cast, tags, recommendations and watch progress.
- A built-in player with HLS/DASH support, source picker, subtitle tracks and
  per-episode resume.
- Library ("continue watching" + bookmarks), search history, and a downloads queue.
- Extensions manager: browse a built-in catalogue, add any repository URL, install /
  enable / update / remove extensions, and reload them into the bridge without
  restarting the app.
- No telemetry. State is stored locally in the OS config directory.

See **[docs/FEATURES.md](docs/FEATURES.md)** for the full, per-app feature list —
including the desktop player, downloads, settings, the JVM bridge and its limitations,
and the deliberately-missing list.

## Cinelab for PC (desktop + bridge)

### Run from source

Requirements: Node.js 20+ and Java 21+ on your `PATH` (or `JAVA_HOME` set) for the
bridge. Official release builds bundle a Temurin JRE 21, so no Java install is needed.

```bash
cd desktop
npm ci
npm start        # launches the app
npm test         # jsdom-based renderer smoke tests
```

The renderer is plain HTML/CSS/JS (no framework) talking to the main process over a
narrow, context-isolated IPC surface. All media is piped through a loopback proxy so
extensions that require `Referer` headers still work.

### How extensions work on PC

`.cs3` extensions contain Android dex bytecode. The **bridge** (`bridge/`):

1. Translates `classes.dex` back to bytecode (dex2jar-style) at first load, cached on disk.
2. Compiles the upstream CloudStream `library` module for the JVM (it is multiplatform
   Kotlin — Android bits are replaced by headless shims).
3. Loads the extension in-process, exposing a small loopback-HTTP API the Electron app
   talks to (`/providers`, `/home`, `/search`, `/load`, `/loadlinks`, …).

`desktop/src/main/bridge.js` auto-detects the bridge payload and a Java runtime; the
rest of the app (repository management, downloads, library) works even when the bridge
is unavailable.

### Building official PC packages

Packaging uses `electron-builder` with the bridge built from source:

```bash
cd bridge
./fetch-upstream.sh                    # one-time: downloads upstream CloudStream sources
./gradlew :app:installDist             # produces bridge/app/build/install/cinelab-bridge

mkdir -p ../desktop/build/jre          # optional but recommended: a Temurin 21 JRE in
# ../desktop/build/jre makes electron-builder bundle it (see the Release workflow);
# skip it and the app falls back to system Java 21+ at runtime.

cd ../desktop
npm ci
npx electron-builder --linux AppImage  # or: --win nsis
```

`desktop/package.json → build.extraResources` bundles the bridge install and the JRE
into the app's `resources/` directory (`resources/bridge`, `resources/jre`). The **Release Desktop** workflow
(`.github/workflows/release-desktop.yml`, triggered by `desktop-v*` tags) builds the
bridge, packages Linux (AppImage) and Windows (NSIS) installers on GitHub Actions, and
publishes them to a GitHub release. macOS builds are unsigned — package locally with
`npm run dist:mac` if you need one.

The release packages bundle **both** the bridge and a Temurin JRE 21 (downloaded by the
Release workflow from Adoptium), so the installers work out of the box — no system Java
required. Local `electron-builder` runs without `desktop/build/jre` fall back to a system
Java 21+ at runtime.

## Cinelab for Android

A fork of upstream CloudStream with Cinelab branding, in-repo public release keystore
(reproducible builds — see `android/keystore/README.md`) and the updater pointed at this
repository.

```bash
cd android
./gradlew assembleStableRelease     # or open in Android Studio
```

The output APK is signed with the public keystore committed at
`android/keystore/cinelab-release.keystore` (see its README). GitHub Actions builds the
APK on every push touching `android/` (`.github/workflows/build-android.yml`).

## CI

| Workflow | Purpose |
|----------|---------|
| `Build Bridge (Cinelab)` | Builds the JVM bridge from upstream sources, runs a smoke test (`/health`, `/providers`) and uploads the distribution. |
| `Build Android (Cinelab)` | Assembles the stable release APK. |
| `Release Desktop (Cinelab)` | Tag-triggered (`desktop-v*`) desktop package + GitHub release. |

Build failures surface as workflow **annotations** (the `Annotate failures from log` step
converts compiler output into `::error::` lines), so compiler errors are visible without
downloading logs.

## Legal status

- Extensions are installed only from repositories **you** add; Cinelab provides none.
- The built-in repository catalogue is metadata derived from public community listings;
  it is not an endorsement. Sources may be slow, broken or unsafe — review them first.
- Cinelab never downloads or hosts pirated content. All legal responsibility for the
  content you access lies with you and with the extension authors.
- The repository is GPL-3.0. Third-party works remain under their own licenses.

## License

GPL-3.0-only. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
