# Distribution

The GitHub repository is public under the [MIT license](../../LICENSE). The root
workspace remains `private: true` to prevent accidental npm publication. Public
source visibility does not create a release, installer, update feed or trusted signature.

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

## Release decisions

Before publishing installers, choose supported architectures and OS versions,
trusted signing/notarization, credentials, release channels and update behavior.
Windows and macOS require their own native evidence. Existing CI exercises both
platforms with controlled tests; physical devices and account sign-in remain
separate checks. Do not include recordings, native account profiles, caches or
personal paths in source or release assets.

See [verification](verification.md), [contributing](../../CONTRIBUTING.md) and
[third-party notices](../../THIRD_PARTY_NOTICES.md).
