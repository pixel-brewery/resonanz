# Angular, Mosaik, visualizations and language

Read [frontend architecture](../../../../docs/architecture/frontend/README.md),
[component contracts](../../../../docs/architecture/frontend/components.md),
[internationalization](../../../../docs/architecture/frontend/internationalization.md)
and [reference decisions](../../../../docs/architecture/frontend-reference.md)
for affected behavior. Inspect installed public Mosaik APIs and the closest active
Symphony pattern before adding an alternative composition.

## Views and owners

Use standalone Angular, OnPush, Signals, supported Signal Forms and focused
presenters. Keep TypeScript, markup and SCSS in matching files. Views compose
controls and render state; presenters own application actions/state; directives
own DOM coordination and pure pipes/functions own display transformations. Use
read-only derived state and clean up owned subscriptions/effects/media operations.

Shell/Capture presenters reuse recording/live owners. Ring, Analysis and Questions
share SessionPresenter; VoicePresenter coordinates question dictation/current live
conversation. SettingsPresenter owns validated non-secret settings and correlated
account flows. `DesktopApi` is the renderer's typed host boundary. Do not move
native execution, persistence or credentials into an Angular component/service.

Saved-session question dictation currently refuses to start while capture is
active. Its microphone lease is exclusive. Preserve that gate when fixing races;
another question or recognition operation must not acquire/release its ownership.

Use public Mosaik Angular controls, icons and Soho light/dark theme APIs. The owner-approved warm/serif export in
`resources/themes/resonanz-soho.ts` is the canonical token layer for both renderer
bootstraps; apply it through public `provideTheme` overrides. Appearance/language changes preserve mounted capture and form ownership.
Keep loading/empty/processing/error/retry states visible and actionable. Follow
existing form/command semantics rather than importing a peer project's unrelated
generated HTTP client, server-state/push infrastructure or styling policy.

## Reusable visualization contracts

Components under `apps/renderer/src/components` accept typed presentation inputs
and emit actions/selections. Session-to-visual conversion belongs in presenters
and `sessionVisualization.ts`. Waveforms use measured local audio peaks; empty or
silent input remains honest. Evidence selection resolves real transcript/audio
bounds. Week/thread projections use session dates and validated topic evidence
from per-session analyses, with exact shared-tag/text connections for older data.
They do not establish a separate whole-library inference or unlimited catalog coverage.

Preserve keyboard selection/focus, marker shape meanings beyond color, reduced
motion and both Soho modes. Reuse the modal focus directive's Mosaik shadow-root
handling. The mini recorder uses a separate passive native window and bounded Main
projection/action contracts. Its bootstrap has no workspace, account or media owner.
Preserve the exact passive frame allowlist and session-bound command checks; the
main renderer remains the only capture owner.

## Internationalization and time

English is the default interface; both English/German tables under
[libs/intl](../../../../libs/intl/src) are complete flat catalogs. Use stable
`loc.resonanz.<feature>.<name>` keys, whole translated phrases and matching Mosaik
positional `{0}` placeholders in both tables. Renderer text uses the reactive
TranslatePipe/TranslateFacade; native menus/dialogs use the same portable catalog.
Keep key parity, non-empty values and placeholder compatibility verified.

Keep application errors as stable keys until display. External provider/system
messages, native challenges, credentials, transcripts, titles and saved answers
remain their original content. UI language is independent of speech recognition
locale, voice and editable conversation instructions. Changing it does not rewrite
stored content or reset capture; new analysis/questions use the selected language.

Format dates/numbers in the interface locale while preserving instant/media-offset
semantics from [Sessions](sessions.md). Weekly/local-day grouping lives in its
existing projection owner and must respect local calendar boundaries.
