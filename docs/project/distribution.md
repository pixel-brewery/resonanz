# Distribution

The GitHub repository is public under the [MIT license](../../LICENSE). The root
workspace remains `private: true` to prevent accidental npm publication. Public
source visibility does not create a release, installer or trusted signature; the
update check only finds what a release publishes.

## Build a native bundle

Use Node 24 LTS and Yarn 4.10.3 with the pinned vendor archives:

```sh
yarn install --immutable
yarn verify
yarn package
yarn verify:package
yarn test:e2e --packaged
```

`yarn make` runs makers supported by the host. `RESONANZ_OUTPUT_DIR` selects a
separate local output directory so an existing user app can be preserved. Electron
Packager stages outside the source tree in the task-owned sibling
`.resonanz-package-staging/`. Keep the checkout and staging parent outside synced
Documents/iCloud directories.

The bundle includes the built renderer/preload/Main/Utility, required native speech
packages, bridge script, audio worklet, fonts, icons and complete license notices.
`verify:package` compares the artifact to the current source build and checks its
runtime dependencies. Packaged E2E drives that artifact's executable with an isolated
profile and synthetic media. Neither command proves personal-account inference or
physical microphone quality.

## Automatic releases and updates

The prepared release workflow follows the same merge-to-release policy as the
other Pixel Brewery products. A verified eligible dependency PR merges
automatically and requests a release for that exact merged source; a human merge
to `main` starts the normal release workflow. Failed release requests can be
retried separately from the successful merge.

Each release builds and exercises macOS ARM64 and Windows x64 installers, then
publishes their sizes, SHA-256 hashes and version-specific download links. All
required checks and artifact checks must pass before the release becomes latest.
The packaged app uses those feeds: check for an update, explicitly download the
installer, then choose restart/update after verification. Without a matching
platform feed, the app reports that it is up to date. Feed publication and a
successful native installation remain separate verification evidence.

Workflow publication, the dedicated release-App configuration and the first
successful native release remain separate activation steps. See the
[technical distribution contract](../architecture/distribution/README.md) for
the implemented source, retry behavior, optional signing and exact prerequisites.

## Installer manifests

The release workflow creates `update-<platform>-<arch>.json` alongside the
installer. For a controlled local artifact check, the same writer can be run
explicitly:

```sh
node tools/write-update-manifest.mjs --installer out/make/<installer>.dmg \
  --version 0.2.0 --platform darwin --arch arm64 \
  --base-url https://github.com/pixel-brewery/resonanz/releases/download/v0.2.0
```

This local command prepares metadata; publishing uses the verified release
workflow. Main downloads the installer, checks its size and SHA-256, and offers a
restart that opens it.

## Signing and platform acceptance

The publication targets are macOS ARM64 and Windows x64. Trusted
signing/notarization and their credentials require explicit configuration.
Windows and macOS require their own native evidence. Existing CI exercises both
platforms with controlled tests; physical devices and account sign-in remain
separate checks. Do not include recordings, native account profiles, caches or
personal paths in source or release assets.

See [verification](verification.md), [contributing](../../CONTRIBUTING.md) and
[third-party notices](../../THIRD_PARTY_NOTICES.md).
