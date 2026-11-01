# Verification, native acceptance and packaging

[package.json](../../../../package.json), [Nx configuration](../../../../nx.json),
resolved targets and [Vitest configuration](../../../../vitest.config.mts) are
authoritative. Use the pinned Node/Yarn toolchain. Python 3 plus Node, without
third-party Python packages, runs the installed skill/inheritance checks.

## Select evidence by production owner

Define the observable invariant before adding a spec. Colocate it with the actual
source using the exact basename with `.spec` inserted. Use existing suites rather
than creating a scenario-only spec, empty production owner or test directory.
Supplied copied audio specs remain unchanged. Test ordering, validation, state
transitions, cancellation, ownership, limits, recovery and no-side-effect failures
where relevant; do not test wording, private method layout or a trivial delegation.

Vitest projects select copied audio/browser-media, native and renderer-presenter
boundaries. Resolve the current project's runner before using a focused selector.
The native packaging helper uses Node's test runner. Keep the configured
single-worker/serialized heavy-job policy across agents.

Use typed deterministic fixtures, isolated task-owned profiles and controlled
native driver/dialog boundaries. Restore mocks/timers/environment changes. Do not
write personal accounts, recordings or runtime caches into tracked files or use
global CLI accounts as a test fixture.

| Command                    | Actual scope                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `yarn verify:skills`       | Locked shared base, inherited local skill and relative Markdown links              |
| `yarn verify:vendor`       | Pinned Mosaik/Synapse archive integrity                                            |
| `yarn verify:audio`        | Original/adapted audio hashes and generated static worklet                         |
| `yarn typecheck`           | Native TypeScript and Angular/template types                                       |
| `yarn test`                | Configured behavior suites and Node packaging-tool tests                           |
| `yarn build`               | Configured renderer and desktop/Utility bundles through Nx                         |
| `yarn verify`              | The configured skill/provenance/type/test/build sequence                           |
| `yarn format:check`        | Repository formatting, excluding the immutable imported base                       |
| `yarn test:e2e`            | Built Electron app through the existing controlled desktop harness                 |
| `yarn package`             | A native application bundle for the host OS                                        |
| `yarn verify:package`      | Actual artifact contents/resources/dependencies/licenses against the current build |
| `yarn test:e2e --packaged` | The packaged artifact's actual executable                                          |
| `yarn make`                | Host-supported installer/archive makers                                            |

Run focused checks first, then the broader configured gates required for the
affected change. A skill/documentation-only change needs inheritance/link/content
and relevant format validation; it does not justify launching Electron or account
inference. Never report unrun gates as passed.

## Desktop UI and package evidence

[tools/verify-desktop.mjs](../../../../tools/verify-desktop.mjs) is the current
Playwright/Electron workflow owner. Reuse its fixture/profile/process lifecycle
instead of adding a product HTTP server, browser preview or separate test app.
Shared browser guidance applies through this native runner; another repository's
Chrome/port policy is not Resonanz's desktop contract. Use meaningful stable
selectors and actual state/persistence assertions within the existing harness.

Control launch and cleanup of task-owned helpers; preserve unrelated app/provider
instances and user profiles. Synthetic media and dialogs exercise only their
controlled paths. A screenshot or source app pass does not establish packaged
permissions, native speech or inference.

For packaging changes, inspect [Forge configuration](../../../../forge.config.mjs),
[build tooling](../../../../tools/build-node-apps.mjs),
[package verification](../../../../tools/verify-package.mjs) and
[distribution requirements](../../../../docs/project/distribution.md). Preserve
external native speech helpers, preload format, bundled assets, complete upstream
license text and source/vendor metadata. Packager staging uses only the authorized
sibling exception. `RESONANZ_OUTPUT_DIR` can preserve an existing artifact.

After packaging, verify the actual artifact and exercise its executable before
claiming package behavior. Host packaging does not prove another OS, trusted
signing/notarization, public installer readiness or an update feed.

## Real integration and reporting

Add `--speech` only for an intentional audible check with an installed system
voice. On Windows, `node tools/verify-windows-speech.mjs` exercises the supplied
System.Speech bridge with synthesis/file recognition when matching components are
installed; record unavailable checks explicitly.

Physical recording, live recognition, each provider's authenticated inference,
actual speech output and decoded stereo archive need distinct evidence. A fixture,
binary presence or verified subscription status proves none of those other steps.
Do not silently initiate personal login/inference to complete a controlled suite.

Maintain [docs/project/verification.md](../../../../docs/project/verification.md)
with the actually observed scope, platform, fixture/account mode and remaining
requirements. Earlier real prototype evidence and later controlled redesign tests
remain separate. Store detailed logs/artifacts under ignored `.codex-work/` and
report the checks actually run without implying release readiness.
