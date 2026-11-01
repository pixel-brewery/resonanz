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

## Update manifests

A packaged build looks for `update-<platform>-<arch>.json` among the assets of the
latest GitHub release of this repository. Without such an asset it reports that it
is up to date. To offer a version, build the installer with `yarn make`, then write
its manifest and attach both files to the release:

```sh
node tools/write-update-manifest.mjs --installer out/make/<installer>.dmg \
  --version 0.2.0 --platform darwin --arch arm64 \
  --base-url https://github.com/pixel-brewery/resonanz/releases/download/v0.2.0
```

The app downloads the installer in the background, checks size and SHA-256, and
offers a restart that opens it. Signing, notarization and release channels remain
release decisions below.

## Release decisions

Before publishing installers, choose supported architectures and OS versions,
trusted signing/notarization, credentials, release channels and update behavior.
Windows and macOS require their own native evidence. Existing CI exercises both
platforms with controlled tests; physical devices and account sign-in remain
separate checks. Do not include recordings, native account profiles, caches or
personal paths in source or release assets.

See [verification](verification.md), [contributing](../../CONTRIBUTING.md) and
[third-party notices](../../THIRD_PARTY_NOTICES.md).
