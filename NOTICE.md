# Skystream — Notices & Attribution

Skystream is an independent, open-source media-centre project. It is **not affiliated
with, or endorsed by, the CloudStream project or its authors.** "CloudStream" is a
trademark of its respective owners.

## What Skystream is based on

### Skystream for Android (`android/`)
A fork of [recloudstream/cloudstream](https://github.com/recloudstream/cloudstream),
Copyright © the recloudstream/CloudStream authors, licensed under the
GNU General Public License v3.0 (see `android/LICENSE`).

Modifications made by the Skystream project (see `android/`):
- Renamed the application to **Skystream** (`com.skystream.app`), new launcher icons and banner.
- In-app updater and source links point to the Skystream repository (`Su-borno7/Skystream`).
- Version reset to 1.0.0; the in-repo public keystore signs release APKs (reproducible-build model).
- 53 localized `strings.xml` files updated to the Skystream name.
- The upstream `desktopApp` skeleton and F-Droid/fastlane metadata were removed (Skystream ships a separate PC app).
- Bundled fonts: Skystream replaces the default app typeface with **Inter** (SIL Open Font License 1.1, © The Inter Project Authors — see `android/THIRD-PARTY-LICENSES.txt`; the desktop app bundles it under `desktop/src/renderer/fonts/` with its license in `INTER-LICENSE.txt`). Other fonts in `android/app/src/main/res/font/` remain under their original licenses.

Everything else is unchanged from upstream CloudStream at the time the fork was taken
(upstream commit `1a36edb…` is the unrelated initial commit of this repo; the fork base
is the `master` branch of recloudstream/cloudstream as of 2026-11-24).

### Skystream for PC (`desktop/`, `bridge/`)
A new desktop application written by the Skystream project, implementing the CloudStream
user experience and the CloudStream extension repository format. It is not a copy of any
CloudStream source code. The `.cs3` extension execution strategy (dex → jar translation,
stub Android classes, compiling the upstream `library` module for the JVM) was pioneered
in the open-source community, e.g. by the Stream Goat project (GPL-3.0); the Skystream
bridge is an independent implementation of the same technique.

### CloudStream extension repositories
CloudStream repositories (`repo.json` + `plugins.json` + `.cs3` files) belong to their
respective authors. The list of community repositories shown in the app's "Browse
repositories" screen is derived from [recloudstream/cs-repos](https://github.com/recloudstream/cs-repos).
Skystream does not ship, host or endorse any content source. Extensions are installed
only when the user explicitly adds a repository and installs an extension.

## Licenses

- The repository as a whole is distributed under GPL-3.0 (see `LICENSE`), because it
  contains substantial GPL-3.0-licensed work from the CloudStream project.
- Third-party libraries keep their own licenses; see `desktop/package.json`,
  `bridge/build.gradle.kts` and `android/gradle/libs.versions.toml`.
