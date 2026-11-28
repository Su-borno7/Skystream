# Cinelab public release key

This directory contains the signing key used for the official **Cinelab** Android release APKs.

It is committed to the repository on purpose, following the reproducible-build model:
anyone can build Cinelab from source and verify that the APK matches the one published
on the [GitHub releases page](https://github.com/Su-borno7/Skystream/releases).

- Keystore: `cinelab-release.keystore`
- Alias: `skystream` (the alias inside the keystore was kept when the project was renamed)
- Password: see `PASSWORD.txt` (this key is public)

Because the key is public, its authenticity is anchored by the GitHub repository and the
release process, not by secrecy of the key. Do not reuse this keystore for anything else.
