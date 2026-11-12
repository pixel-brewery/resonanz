# Automated desktop distribution

## Source contract and activation

Resonanz follows the same repository policy as Symphony, Archipel and Synapse:
complete verification before an eligible dependency PR merges; a main-branch
release after a human code merge; an explicit, separately retryable release request
after a native-token Dependabot merge. Native installers and their update feeds
replace library package publication for this product.

The workflow and tools in this source revision implement that pipeline. Their
publication to the default branch, a successful run of that revision and native
installation are separate acceptance evidence. The packaged updater is composed
from the existing [PR #2](https://github.com/pixel-brewery/resonanz/pull/2), whose
integrated head is `f27071f32b7315dbeda12786a6a2cffb283985d4`. Its Main-owned
coordinator, installer adapter and typed renderer contract remain the runtime
owners. The manifest tools use that existing transport contract; native
installation is separately verified.

## Local packaging commands

`yarn package` builds the application and invokes the validated Forge wrapper's
`make` operation. `yarn make` aliases that same command; `yarn package:unpacked`
retains the bundle-only Forge `package` operation. Desktop quality CI uses
`yarn package`, exercising the installer entry point on each native host.

Forge writes outputs under `out` unless `RESONANZ_OUTPUT_DIR` selects another
directory. On macOS ARM64, the application is
`out/Resonanz-darwin-arm64/Resonanz.app` and the DMG is
`out/make/dmg/arm64/Resonanz.dmg`. Other host architectures use their own
architecture directory. The wrapper validates the packaged executable, ASAR and
returned nonempty installer/archive files before reporting success. These commands
require the pinned Node 24 toolchain and do not publish a release.

## Release identity and verification

`.github/workflows/release.yml` accepts a push to `main` or a manual semantic
increment (`patch`, `minor`, `major`, default `patch`). An optional `source_sha`
must equal the workflow's source commit when supplied by automatic merge
continuation. Release execution is serialized and does not cancel an older run.
Only the canonical public repository `pixel-brewery/resonanz`, immutable ID
`1440725741`, and its main branch may publish.

Before preparing an automatic release, the workflow applies the
[documentation policy](../repository-quality/README.md#documentation-changes-in-this-source-revision)
to the push's complete previous/next commit range. An explicit documentation-only result skips the
candidate, native verification/builds, installer publication and update feeds. Manual releases always
run the full pipeline. Unknown or empty comparisons require verification; an unreadable comparison
fails classification. Configure consumes a successful explicit full-verification decision; native
builds depend on configure and publication depends on both, so a skipped candidate cannot publish.
The dependency-refresh continuation also remains tied to durable publication. No release or updater
runtime behavior changes for code releases.

The configure job resolves the numeric version, metadata commit and annotated
`v<version>` tag exactly once through the configured fixed Nx desktop release
group. Only package metadata, lockfile and changelog may change. It preserves
that exact candidate in a Git bundle for subsequent jobs. Platform jobs use that
candidate rather than independently calculating a version or building a moving
branch tip.

The supported native publication targets are macOS ARM64 and Windows x64.
Each target performs an immutable installation, source checks, behavior/type
checks and builds, controlled desktop E2E, native installer creation, package
verification and packaged-executable E2E. Missing or failed required verification
prevents publication. These controlled checks do not establish physical device
behavior or personal assistant-account inference.

## Native assets and update contract

Only one macOS DMG and one Windows installer EXE are staged as installable assets.
Each gets a platform-specific JSON feed:

- `update-darwin-arm64.json`
- `update-win32-x64.json`

The JSON object has `schemaVersion: 1`, a numeric `version`, `platform`,
`architecture`, and `artifact` with a plain filename `name`, nonzero integer
`bytes`, lowercase hexadecimal `sha256` and credential-free HTTPS `url`.
Installer URLs refer to the immutable canonical GitHub version release. Feed
lookup uses the matching asset under the repository's latest-release URL.

The Main-owned updater in PR #2 consumes this schema, checks for a newer compatible
version, downloads on explicit request, verifies bytes and SHA-256, and launches
the verified installer for the restart/update action. Build availability, feed
publication, user download and successful native installation remain separate
states. No additional update server or Linux support is introduced by this flow.

## Publication, recovery and credentials

The publication job consumes only the prepared source and same-run native
artifacts. It rechecks repository identity, the exact metadata/tag relationship,
the permitted metadata-only change set, main freshness and every staged asset.
The dedicated release App writes only the atomic metadata commit/tag update;
the native workflow token handles release APIs. It has no general main-protection
exemption.

The release starts as a draft. Existing assets are checked and never replaced
with `--clobber`; a retry uploads only missing files for the same exact candidate.
The draft becomes latest only after all four expected installer/feed assets have
the expected names, sizes, digests and version URLs. The published release and
public feeds are read back and verified. A newer unrelated main commit supersedes
an older candidate. Existing failed runs are recovered in their original run
rather than by silently calculating a second release.

The separate dependency-release request retains the successful merge SHA. A
request retry checks current main and existing release attempts for that exact
source, returning requested, already-requested or superseded. A final source-SHA
check in the release workflow closes the race between reading main and dispatch.
This preserves automatic release triggering despite native-token push-event
suppression. Refreshing remaining dependency PRs follows durable metadata
publication even if a later artifact publication step fails.

The existing organization App `5547670` has metadata read and contents write
access, explicitly restricted to these four repositories. The repository variable
`RELEASE_APP_ID` selects it. `RELEASE_APP_PRIVATE_KEY` must be an environment secret
in `release-main`, whose deployment branch policy permits exactly `main`, with
no review/wait gate. A named secret's presence does not prove its value can mint
the required installation token. Main's PR/check rules exempt only this release
App; deletion and force-push protection have no bypass. Never place the key in
source, logs, PR code or a general repository secret.

## Permanent unsigned distribution policy

Certificate signing and Apple notarization are not planned. Forge always uses
certificate-free ad-hoc macOS sealing (`identity: '-'`, identity validation off,
Hardened Runtime off, errors fatal). Windows application bundles and installers
remain unsigned. There are no platform certificate or notarization credential
inputs, import steps or temporary keychains in the release workflow. Ambient
legacy signing variables cannot select another Forge signing mode.

Every macOS release still requires strict recursive bundle verification, an
ad-hoc signature without Hardened Runtime, and DMG integrity verification. Both
platforms retain package checks, packaged E2E, exact installer sizes/SHA-256 and
verified feed publication. These checks do not establish publisher identity or
guarantee software safety. The release notes and product distribution guide state
that downloads and execution are at the user's own risk under the MIT license,
with the public source available for inspection.

The release App key authenticates metadata/tag publication to GitHub. It is
independent of platform signing and remains required in `release-main`.

## Dependency update boundary

Dependabot uses its native rebase strategy for npm and GitHub Actions updates.
The merge workflow checks the successful classification job, both native desktop
jobs and the aggregate Quality Gate from the triggering CI attempt. It merges
only the verified Dependabot revision after confirming that it includes current
`main`, then requests the normal release for the merge commit. Human PRs use
normal review and merge controls.

Dependabot skips the exact packages backed by committed Mosaik, Markdowner and
Synapse archives. A registry version bump would point Yarn at a local archive
that has not been imported. Registry-backed packages such as Mosaik MCP still
receive updates. When importing an archive, retain its provenance, sanitized
content, lockfile consistency and public-content checks.
