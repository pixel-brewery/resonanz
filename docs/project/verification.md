# Verification and evidence

Updated 2026-11-01. Resonanz uses native Codex/Claude account sign-in, system speech
and the provenance-verified upstream audio core. An additional API key or cloud speech provider
is outside the product. Evidence below separates earlier real integration checks,
controlled redesign checks and requirements that remain unverified.

## Repository privacy maintenance: 2026-11-01

Repository source, guidance and documentation now use neutral upstream references.
The private upstream identity is withheld while its revision, original paths,
original hashes and complete supplied license text remain recorded. One PCM
worklet processor identifier adaptation and one vendored documentation-generator
comment adaptation have explicit original/downstream provenance.

Checks passed: current tracked/unignored file names and contents plus all 12 decoded
vendor archives contained no prohibited project reference; audio provenance verified
63 files; the generated static worklet matched; the seven existing PCM worklet
behavior specs passed; the pinned architecture skill and relative links validated.
The existing README application screenshot was also inspected and contains no
private project label. These maintenance checks do not establish native recording,
speech, packaging or account inference. Older ignored local package artifacts
predate this maintenance and are not evidence for the current source state.

After the vendor lockfile refresh, an immutable installation and the complete
`yarn verify` passed under Node 24: **411 behavior tests in 49 files**, **17 tooling
tests**, native/Angular type checks and both production builds (two executed Nx
tasks). The guard's ten cases also passed after diagnostic path redaction;
repository formatting, source provenance and the final skill/link checks passed.
The integrated log is `.codex-work/verify-2026-11-01.log`. Packaging, desktop E2E
and Windows were not rerun locally for this maintenance revision.

The integrated distribution-source revision subsequently passed the complete
`yarn verify`: **413 behavior tests in 49 files**, **51 single-worker tooling
tests**, native/Angular type checks and both builds. The tooling suites cover
release request recovery, exact installer/feed receipts and optional signing
configuration. Workflow YAML, shell syntax, Nx release configuration discovery,
formatting and source-content checks also passed. The final integrated log is
`.codex-work/repository-alignment-verify-2026-11-01.log`. No release, tag, signing
operation or native installer publication was executed during local validation.

Integration on the existing updater/window-chrome head
`f27071f32b7315dbeda12786a6a2cffb283985d4` passed an immutable installation,
**22 focused updater/process-supervision tests in three files**, and the full
verification with **448 behavior tests in 55 files**, **51 tooling tests**,
native/Angular types and both builds. Formatting and the final skill/link drift
check passed. Logs are in `.codex-work/ci-alignment/integration/`; this evidence
does not replace the native installer/E2E matrix executed by GitHub CI.

[Desktop CI run 41291030041](https://github.com/pixel-brewery/resonanz/actions/runs/41291030041)
then passed both macOS and Windows jobs for commit
`4053700d960bc0b7c74448603b0af0d60347cd61`, followed by `Quality Gate`.
Both platforms passed immutable installation, formatting, complete source
verification, built-app E2E, native packaging, package verification and the
packaged-executable E2E. The Windows speech-runtime check also passed. These are
controlled CI checks; trusted signing, a published update feed, real update
installation and personal-account/device coverage still need separate evidence.

## Earlier prototype: actual macOS execution

The keyless macOS arm64 prototype ran as a native bundle. Package verification
compared current bundles/resources, native dependencies, fonts, worklet, icons,
complete MIT/upstream text and local ad hoc signature. Its final packaged state
passed all eight controlled workflow groups: capture, pause/resume, ordered finish,
decoding/playback, organization, I/O, keyless settings, reload/restart and deletion.
That automated run used synthetic microphone input and controlled native dialogs.

The actual user app separately completed native Codex browser sign-in, read its
advertised default model, analyzed a synthetic transcript and correctly answered a
follow-up about Mira, Tuesday and a timestamp. These were real authenticated account
inference. Saved-text TTS used the actual system voice with pause/resume/stop.
Account state and saved results survived the keyless app update.

A synthetic German WAV imported through the app produced 17 actual native timestamped
segments, including the Resonanz project, Mira/Tuesday/documentation and Leon/audio
recording. OS permission dialogs were completed. An initial permission timeout was
retried after approval; startup cleanup and microphone permission handling were fixed
and regression-tested.

A real spoken run used the physical default microphone to recognize a synthetic
sentence played by the Mac, pass it to Codex and play the native answer confirming
readiness. Another actual answer, numbers 1 through 20, was explicitly interrupted
while speaking. Its unheard remainder was not added to the spoken transcript; model
text remained in question history. A muted probe produced no recognition turn.
Pause/resume continued the same session. Stop saved it without reported speech or
assistant errors.

The saved conversation was actually decoded: **two channels, 182.7 seconds and
2,197,615 archive bytes**. Microphone RMS was **0.01421**, output RMS **0.01247**,
with **81,278 samples above absolute 0.001**. This established actual assistant output
in the archive in addition to microphone energy.

The actual native tray reopened the hidden window and started a short microphone
recording. It was stopped/saved; only that task-owned diagnostic session was deleted.
The user's auto-transcription preference was restored.

## Earlier prototype: reproducible and Windows checks

The final baseline passed 12 vendor archive hashes, 63 unchanged audio source hashes,
the generated static worklet comparison, native/Angular type checks, both builds,
**244 behavior tests in 30 files** and **7 packaging-tool tests** under Node 24.
The public main-branch macOS/Windows CI also passed native packaging and controlled
application workflows. A green matrix is not physical microphone evidence.

Windows additionally compiled the supplied System.Speech bridge, synthesized a real
WAV and recognized two en-US file passages. The speech checker records installed
languages and explicitly records unavailable recognition checks. Physical Windows
microphone and German speech-package verification remain pending.

Local evidence stays under ignored `.codex-work/`, including `keyless-verify.log`,
`keyless-final-verify.log`, `keyless-packaged-e2e.log`,
`keyless-final-packaged-e2e.log`, `keyless-final-package.log`,
`out/package-verification.json`, `native-assistant-evidence.json`,
`native-keyless/transcription-evidence.json`, `native-keyless/live-evidence.json`,
`native-keyless/tray-evidence.json` and `run-forge-tests.log`.
Personal profiles, credentials and recordings are not committed.

## Design handoff and language work

Before internationalization, the redesigned source passed the complete configured
verification with **251 behavior tests in 32 files**, 7 tooling tests, provenance,
native/Angular types and both builds. Its source Electron workflow passed all eight
groups with synthetic input, including a persisted user marker. Sixteen controlled
visual captures covered eight views in Soho light/dark. An evidence click selected
the corresponding transcript passage. Those fixtures establish UI behavior and
appearance, not real model inference.

The final language-enabled state passed **255 behavior tests in 33 files**, **7 tooling
tests**, vendor/audio/worklet checks, native/Angular types and both builds. Catalog
parity and persistence tests include interface-language saving during active capture.
Both source and the newly built macOS arm64 bundle passed **nine controlled workflow
groups**, including English defaults, German/English UI switching during capture,
independent speech locale, localized native menus and persistence after full restart.
Package verification compared 134 files, checked native dependencies and confirmed
the local signature. The new bundle is under `out/design-handoff/`.

Current evidence is in `i18n/verify-final-3.log`, `i18n/e2e-source-3.log`,
`i18n/package.log`, `i18n/verify-package.log` and `i18n/e2e-packaged.log` under
`.codex-work/`. New question dictation and structured model output still need separate
physical speech/real-account evidence. That local redesign pass did not include
the Windows CI matrix; the later integrated revision passed both native CI
platforms as recorded above.

The subsequent local preview in `out/design-refinement/` packages the later task,
transcript and processing-state refinements. Its macOS arm64 build and package
verification passed, comparing 134 files and verifying the local signature. The
actual packaged executable passed all nine controlled workflow groups after the
test harness was synchronized with the transcript menu's completed navigation.
This does not establish real-account inference or complete visual handoff parity.
Logs are `handoff-audit/package-current.log`,
`handoff-audit/verify-package-current.log` and
`handoff-audit/e2e-packaged-current-2.log` under `.codex-work/`.

The later state-fidelity pass passed the complete configured verification with
**280 behavior tests in 39 files**, **7 tooling tests**, native/Angular types,
both production builds and all skill/vendor/audio/worklet checks. The production
source executable passed all nine controlled desktop workflow groups. Evidence is
`handoff-audit/verify-fidelity.log` and `handoff-audit/e2e-fidelity-source-3.log`.

`handoff-audit/states-K0DujV/` contains **67 controlled captures** across Soho light
and dark: library ready/processing/waiting/error previews and attention filtering,
literal transcript search, three evidenced topic threads, ring/chapter/digest,
selected analysis evidence, question assignment/gaps, all three setup steps and
Settings sections. The fixture uses fictional handoff data and silent sparse WAVs;
its synthetic peaks are expressly visual data. Only this fixture uses 2025 to match
the artboard weekdays; production calendar behavior is unchanged. Word counts and
recording bytes come from the actual fixture rather than the artboard's captions.

The sixteen setup captures in `handoff-audit/states-meNYQ1/` additionally wait for
native Segment selection geometry to converge. The read-only measurement in
`handoff-audit/states-9Qz56Y/segment-geometry.json` confirmed the normal 200 ms
indicator animation; no design-system override or upstream change was needed.

Six Voice states were rendered using the development build's public Angular debug
API and explicit presentation projections. They establish component appearance,
evidence focus, bounded clip arcs and PromptBox draft behavior. Eight separate
presenter tests cover operation/lease ownership, late recognition, cancellation,
answer correlation and note/playback state. Neither kind establishes current real
account inference or native spoken dictation.

The same controlled Electron run exercised the real passive native mini window:
always-on-top and sandbox properties, its denied non-mini API, one synthetic
capture/session, marker persistence/undo, pause/resume, stale-session rejection,
ten-second collapse with native bounds, preference toggling, final media flush
and control invalidation. This is synthetic media evidence; OS compositor stacking
over other applications, full-screen workspaces and the actual menu-bar image still
need separate manual/platform checks. All task-owned helper applications were closed.

The current macOS arm64 bundle is in `out/handoff-states/`. Package verification
compared **158 files** and verified its local signature. Its actual executable
passed all nine standard controlled desktop workflow groups and the separate
native mini-recorder sequence above. Logs are `handoff-audit/package-fidelity.log`,
`handoff-audit/verify-package-fidelity.log`,
`handoff-audit/e2e-fidelity-packaged.log` and `handoff-audit/capture-packaged.log`;
the packaged mini evidence is in `handoff-audit/states-scG064/`.

## Current theme and native presentation

The owner revised the visual direction in Mosaik's Theme Editor after the original
handoff. The current export supplies warm beige/brown schemes, Georgia and the
owner's smaller typography: 16/14 px body roles and 14 px buttons. The complete
export is preserved in the typed portable theme; only insignificant comma spacing
in `rgba()` shadow strings changed to satisfy the public CSS template-literal type.
Both renderer bootstraps and the initial native window use this source.

The initial warm-theme state passed the full configured verification: **364 behavior tests in
45 files**, **7 tooling tests**, native/Angular type checks, both production builds
and the skill/vendor/audio/worklet checks. Logs are `theme/verify.log` under
`.codex-work/`. Three session-store cases additionally verify canonical protected
audio URLs for older records without rewriting their persisted data or inventing
audio availability.

`theme/states-de.log` and `theme/states-en.log` record successful controlled
development-build runs in both interface languages and appearance modes. Captures
are in `handoff-audit/states-p0hzAs/` and `handoff-audit/states-BY6OP6/`. Runtime
measurements confirm Georgia and the exact exported light/dark background colors.
The runs cover library states, chapter/digest selection and actual fixture-audio
playback, analysis evidence, question lookup/gap views, six projected Voice states,
setup, Settings and the actual native capture/mini surfaces. Voice and question
lookup projections establish rendering only; they do not execute an assistant.
The capture lane writes synthetic microphone bytes and checks visible waveform
bars, clock formatting, marker undo, pause metadata and stale-session rejection.

Setup and Settings now navigate to their native presentation sizes without helper
resizing: onboarding targets 1000×720; Settings targets 1000×1180 with workarea
clamping. Returning to the workspace restores its original geometry in the same
window. New session opens the actual 368 px native tray surface. The newly enabled
silence/pause/rate/retention preferences, measured storage and confirmed cleanup
have focused production-owner tests. The earlier production source workflow in
`handoff-audit/e2e-preferences-source.log` passed all **ten controlled groups**,
including preference persistence and confirmed library clearing that preserves
settings and account directories.

That macOS arm64 preview is under `out/warm-theme/`. After the final on-color
CSS corrections, packaging and package verification passed, comparing **159 files**
and verifying the local ad hoc signature. Its actual executable passed all **ten
controlled desktop workflow groups**. A separate packaged core visual run covered
both appearance modes, actual digest playback, evidence/gap navigation, native
setup/settings geometry and synthetic capture/mini behavior. It asserted the exact
exported background colors, Georgia, white content on the rose digest fill and no
global error banner. This run uses the actual idle Voice view; the six projected
Voice states above remain separate development-only rendering evidence.

Logs are `theme/package-final.log`, `theme/verify-package.log`,
`theme/e2e-packaged.log` and `theme/states-packaged.log`. Packaged workflow artifacts
are in `packaged-smoke-iGpRGj/`; final visual captures are in
`handoff-audit/states-ZMypPi/`. Task-owned application instances were closed after
verification; the personal Resonanz profile was not used.

The public Mosaik MCP returned its schema and theme guidance. Its legacy validator
returned **98 palette-policy errors** for the current editor's generated dark
palettes and contrast-aware step-zero colors; that remote validation did **not**
pass. No runtime shape/type errors were reported. The exact editor palettes were
retained. Supporting artifacts are under `theme/`; the
[theme guide](../architecture/frontend/theming.md) describes the runtime contract.

The exact exported dark lowlight/surface pair measures 3.13:1 for small captions;
it remains an open contrast concern. Filled primary and danger controls use their
matching step-zero on-colors, measuring 5.66:1 and 5.18:1 respectively in both modes.
Token ratios do not establish a complete accessibility audit.

## Latest handoff completion pass

The later implementation passed the full configured verification with **409 behavior
tests in 49 files**, **7 packaging-tool tests**, native/Angular type checks, both
production builds and skill/vendor/audio/worklet checks. This includes complete
visible-week detail loading beyond the first thirty sessions, bounded concurrent
decoding, truthful deletion details, context-preserving literal transcript search,
timestamped copying and durable automatic analysis recovery. Recovery tests cover
bounded attempts, verified native account inspection, exact configuration binding,
cancellation races, restart persistence and private retry metadata excluded from
exports. These are controlled behavior checks, not real-account inference.

The current full German and English development runs each produced **102 PNGs**
in both appearance modes with no uncaught renderer errors. The supplied inventory
contains fourteen base screens and twenty-one additional interaction states. The
latest German run includes the final semantic statistic tints and caption wrapping,
chapter four selection, actual third digest clip and synchronized 18:05 evidence.
Both runs cover the real intrinsic native capture/mini geometry, six explicitly
seeded processing stages, literal search with retained context, an actual persisted
retry deadline and cancellation, and all setup/Settings sections. Finished analysis,
successful assistant-test, question-search and six Voice appearances use explicitly
temporary development presentation projections, restored after verification. They
establish rendering only, with no fabricated product fallback or inference claim.

Logs are `handoff-completion/verify-current.log`,
`handoff-completion/states-final-de-2.log` and
`handoff-completion/states-en.log` under `.codex-work/`. The corresponding full
captures are `handoff-audit/states-LCDMTd/` and `handoff-audit/states-KGk0Ur/`.
Their fixture descriptions identify fictional handoff sessions, silent sparse audio,
synthetic design peaks and the shifted example calendar. The ignored
`handoff-completion/fidelity-map.md` maps each supplied screen/state to its owners
and evidence. A screenshot inventory alone is not exhaustive pixel certification.

The latest macOS arm64 bundle is under `out/handoff-completion/`. Its post-CSS
package verification compared **185 files** and verified the local ad hoc signature.
The same implementation's packaged executable passed all **ten controlled desktop
workflow groups** before the final caption-wrap-only CSS adjustment. Logs are
`handoff-completion/package-final.log`,
`handoff-completion/verify-package-final.log` and
`handoff-completion/e2e-packaged.log`; workflow artifacts are
`packaged-smoke-dkUZ8t/`. Host packaging does not establish Windows appearance,
trusted signing/notarization or release readiness.

The corrected post-CSS packaged core run also passed in English/light and dark,
producing **86 PNGs** with no uncaught renderer errors in
`handoff-audit/states-QemOBW/`. It asserts the exact exported backgrounds and Georgia,
chapter four, actual third-clip digest playback, 18:05 evidence selection, retained
search context, native setup/Settings sizing and synthetic capture/mini behavior.
This closes the final English library-statistic appearance delta. Its finished
analysis and successful-test records explicitly skip unsupported development
projections; six Voice states remain separate development rendering evidence.
The log is `handoff-completion/states-packaged-final.log`.

Two focused finished-tray runs subsequently captured both modes with the final
English and German statistic styling and the completed transcript's full progress
bar. They assert actual stored counts **3/4/2**, two assigned tasks, no per-tile
overflow, intrinsic 368 px native sizing and complete fixture restoration.
These remain explicitly development presentation checks. Logs are
`handoff-completion/finished-en.log` and `handoff-completion/finished-de.log`;
captures are `handoff-audit/states-m0yaXa/` and `handoff-audit/states-Dqt1CZ/`.
The production renderer was restored afterwards and the unchanged package passed
resource/signature verification again in
`handoff-completion/verify-package-restored.log`.

A separate native CUA preview of this package, with E2E mode disabled and an isolated
fictional profile, opened the actual popover and explicitly started, paused and
stopped synthetic capture. The retained session is ready with **104.443 seconds**
and **1,674,741 audio bytes**, without transcript or inference. Its driver reported
no active/busy capture before normal exit; the owned processes and driver lock were
confirmed absent afterwards. The personal profile and unrelated running app were
preserved. `handoff-completion/native-preview-evidence.json` records this scope.

On 2026-11-01, a fresh isolated native preview additionally exposed the actual
tray object's title and bounds through read-only main-process diagnostics. The
owner confirmed the visible **64%** processing indicator and popover placement,
then separately confirmed the orange attention indicator and actual tray-click opening.
Its 368 px popover was centered within 0.5 px of the real native tray item, with
an 8 px vertical gap. A later native tray opening was centered exactly. A second
synthetic recording saved **32.285 seconds** and **512,435 audio bytes**. Native
observations captured changing recording pulse frames with advancing time and a
paused title of **0:32** unchanged across fourteen seconds. The stopped native
attention state uses the expected attention image and empty title. Evidence is in
`handoff-completion/native-tray-observations.json`.

The owner then reviewed the remaining states individually: the held gray paused
point with a frozen **0:02** title, followed by the red recording pulse and advancing
time. Both were explicitly confirmed. That final synthetic recording was stopped
through the native UI and saved **58.719 seconds** and **937,891 audio bytes**.
The driver confirmed no active/busy capture, exited normally with code zero and
removed its lock. All owned packaged processes were confirmed absent afterwards;
the synthetic records were retained. The earlier short synthetic record also
returned a native no-speech result during UI exploration; it establishes no new
recognition-quality claim. No authenticated assistant inference was performed.

The fourteen-screen/twenty-one-state visual inventory and local macOS tray review
are complete for the approved warm theme, typography and current product scope.
Native compositor observations above are owner confirmations, not OS screenshots.
Fresh real-account structured-output integration, physical Windows acceptance and
extended device/workspace checks remain separate requirements. System-audio capture
and automatic recording on startup remain explicitly unavailable. Earlier manually
sized setup screenshots are historical; current navigation checks establish the
native default sizing on this Mac.

## Final repository verification

The pre-commit review found and corrected a JSON import edge case: a running
exported pipeline had no execution owner after import and could falsely block
library clearing. Import now marks those stages interrupted/failed, removes
progress/retry deadlines and preserves completed content without importing native
continuations or automatic retry authorization. Both stage variants pass round-trip
regressions, including immediate library clearing without restart.

The final source passed **411 behavior tests in 49 files**, **7 packaging-tool
tests**, native/Angular types, both production builds and the complete
skill/vendor/audio/worklet checks. The focused session-store suite passed all
**29 cases**. Logs are `handoff-completion/precommit-import-tests.log` and
`handoff-completion/precommit-verify-final.log` under `.codex-work/`.

The corrected macOS arm64 bundle is in `out/ready/`. Package verification compared
**185 files** and verified the local ad hoc signature. Its actual executable passed
all **ten controlled desktop workflow groups** with an isolated profile and
synthetic media. Logs are `handoff-completion/precommit-package.log`,
`handoff-completion/precommit-verify-package.log` and
`handoff-completion/precommit-e2e-packaged.log`; artifacts are in
`packaged-smoke-9ueYm7/`. The earlier running user bundle was preserved during
these checks. No fresh personal-account inference or physical-device claim follows
from this verification.

## Window chrome, notifications, playback and updates

The Symphony-style toolbar, status bar, notification centre, mini player and update
path were checked in a Linux container. The repository verification passed skills,
vendor, audio provenance and both typechecks. **445 of 446 behavior tests in 55
files** passed. `OwnedProcessSupervisor.spec.ts` was the only failure: its fixture
did not reach the expected state in this container. Its source and spec are
unchanged and it failed the same way here before this work. Also passing: **9
tooling tests**, both production builds and `format:check`. New specs cover:

- the update coordinator, including disabled states, check, download progress,
  ready, install and failures;
- the verified installer adapter;
- notification history and reporting;
- the update store;
- the playback store and toolbar registration;
- the manifest tool.

The built renderer was rendered in Chromium with a schema-validated stub bridge in
light and dark, 40 states each, with no console errors. Drag regions were measured
with `elementFromPoint` and computed `app-region`. Draggable toolbar width rose:

| Screen   | Before | After   |
| -------- | ------ | ------- |
| Library  | 86 px  | 640 px  |
| Session  | 70 px  | 614 px  |
| Settings | 70 px  | 1230 px |
| Voice    | 148 px | 1070 px |

The remaining width is controls. The harness simulated media and speech timing to
show the mini player. That is visual evidence only; it is not native playback.
Electron E2E, packaging, a real update download and the macOS window drag itself
were not exercised here. No release with an update manifest exists yet.

## Remaining requirements

| Area                  | Verified scope                                                               | Remaining                                                    |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| macOS app             | Earlier real prototype plus current redesigned source/native bundle          | More devices/OS versions                                     |
| Tray                  | Confirmed macOS states, actual tray opening/anchor and capture/mini geometry | Extended compositor/workspace and platform variants          |
| Recording             | Synthetic capture and earlier physical live microphone                       | More devices, quality and long sessions                      |
| Transcription         | Earlier German macOS file/live and Windows en-US file recognition            | Physical Windows microphone and more installed languages     |
| Spoken conversation   | Earlier recognition → real Synapse/Codex → native voice/archive              | New dictation view and more device/language combinations     |
| Assistant accounts    | Earlier real Codex sign-in/catalog/analysis/questions/turns                  | Claude account separately                                    |
| Audio provenance      | 50 production files and 12 specs unchanged; one PCM identifier adaptation    | Deliberate future upstream updates only                      |
| Organization          | Controlled workflows and bounded full-visible-week detail loading            | Native stress with large real libraries                      |
| New analysis/evidence | Validated structured fixtures and source selection                           | Real account structured-output integration                   |
| Distribution          | Public MIT source, native tooling and current macOS/Windows package CI       | Trusted signing/notarization, installer releases and updates |
| Window chrome/updates | Controlled renderer states, update tests and native CI E2E                   | Native macOS drag, a published manifest and real update      |

## Reproduce checks

Use the Node 24 version pinned in `.nvmrc`:

```sh
yarn install --immutable
yarn verify
yarn package
yarn verify:package
yarn test:e2e --packaged
```

`RESONANZ_OUTPUT_DIR` selects a separate local output folder to preserve an existing
app bundle. `--speech` adds intentional audible TTS. Controlled account-free tests
never establish personal sign-in, physical recognition or real inference. See
[desktop CI](https://github.com/pixel-brewery/resonanz/actions/workflows/ci.yml),
[verification tooling](../../tools/) and [distribution](distribution.md).
