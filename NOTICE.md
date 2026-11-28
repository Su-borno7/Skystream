# Cinelab — Notices & Attribution

Cinelab is an independent, open-source media-centre project. It is **not affiliated
with, or endorsed by, the CloudStream project or its authors.** "CloudStream" is a
trademark of its respective owners.

> **Rename history:** Cinelab was originally released as **Skystream** (Android
> `com.skystream.app`, repo `Su-borno7/Skystream`). It was renamed to **Cinelab**
> (Android `com.cinelab.app`); historical `Skystream-*` release artifacts and the
> fork's upstream lineage are described below under their original names.

## What Cinelab is based on

### Cinelab for Android (`android/`)
A fork of [recloudstream/cloudstream](https://github.com/recloudstream/cloudstream),
Copyright © the recloudstream/CloudStream authors, licensed under the
GNU General Public License v3.0 (see `android/LICENSE`).

Modifications made by the Cinelab project (see `android/`):
- Renamed the application to **Cinelab** (`com.cinelab.app`), new paper-plane logo, launcher icons, TV banner and documentation artwork.
- In-app updater and source links point to the Cinelab repository (`Su-borno7/Skystream`).
- Version reset to 1.0.0; the in-repo public keystore signs release APKs (reproducible-build model).
- 53 localized `strings.xml` files updated to the Cinelab name.
- The upstream `desktopApp` skeleton and F-Droid/fastlane metadata were removed (Cinelab ships a separate PC app).
- Bundled fonts: Cinelab replaces the default app typeface with **Inter** (SIL Open Font License 1.1, © The Inter Project Authors — see `android/THIRD-PARTY-LICENSES.txt`; the desktop app bundles it under `desktop/src/renderer/fonts/` with its license in `INTER-LICENSE.txt`). Other fonts in `android/app/src/main/res/font/` remain under their original licenses.

Everything else is unchanged from upstream CloudStream at the time the fork was taken
(upstream commit `1a36edb…` is the unrelated initial commit of this repo; the fork base
is the `master` branch of recloudstream/cloudstream as of 2026-11-24).

### Cinelab for PC (`desktop/`, `bridge/`)
A new desktop application written by the Cinelab project, implementing the CloudStream
user experience and the CloudStream extension repository format. It is not a copy of any
CloudStream source code. The `.cs3` extension execution strategy (dex → jar translation,
stub Android classes, compiling the upstream `library` module for the JVM) was pioneered
in the open-source community, e.g. by the Stream Goat project (GPL-3.0); the Cinelab
bridge is an independent implementation of the same technique.

### CloudStream extension repositories
CloudStream repositories (`repo.json` + `plugins.json` + `.cs3` files) belong to their
respective authors. The list of community repositories shown in the app's "Browse
repositories" screen is derived from [recloudstream/cs-repos](https://github.com/recloudstream/cs-repos).
Cinelab does not ship, host or endorse any content source. Extensions are installed
only when the user explicitly adds a repository and installs an extension.

## Licenses

- The repository as a whole is distributed under GPL-3.0 (see `LICENSE`), because it
  contains substantial GPL-3.0-licensed work from the CloudStream project.
- Third-party libraries keep their own licenses; see `desktop/package.json`,
  `bridge/build.gradle.kts` and `android/gradle/libs.versions.toml`.
