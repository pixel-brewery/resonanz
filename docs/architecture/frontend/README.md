# Angular frontend

The renderer uses standalone Angular components, OnPush, Signals, Signal Forms and
focused presenters. Markup, TypeScript and SCSS live in matching files. Public Mosaik
Angular components supply controls, Reicon/provider icons and the Soho-based Resonanz
light/dark themes. AppearanceService follows the system or a saved preference.

## Feature ownership

- ShellPresenter owns navigation, the shared capture panel and native tray projection.
- CapturePresenter composes existing recording/live owners; views never create a
  second recorder for previews or tray mode.
- LibraryPresenter projects summaries/details, full-text matches, measured waveforms,
  grouped sessions, stage-specific previews, weekly items and validated topic threads.
- SessionPresenter owns one session, player, selection, source context and pending run
  across Ring, Analysis and Questions views.
- VoicePresenter coordinates saved-session dictation or the existing live conversation
  owner. Its operation identity prevents question text from changing source content.
- SettingsPresenter owns validated non-secret settings and correlated account flows.
  Debounced saves preserve edits; interface language has a narrow save path that
  remains available during capture.
- Onboarding reuses SettingsPresenter and an explicitly started microphone preview.
- MiniRecorderProjection sends a coalesced view of the existing capture to Main.
  A separate passive bootstrap renders MiniRecorderView without workspace, media,
  account or storage initialization.

[Reusable components](components.md) render inputs and emit selection/actions. They
have no Synapse, filesystem, credential, persistence or capture ownership. Structured
claims/evidence stay in shared contracts; session-to-visual projections stay outside
the drawing components. The renderer calls only the typed preload API.

## Language

[Theming](theming.md) records the owner-approved export and shared provider.

[Internationalization](internationalization.md) follows Flamox's Mosaik translation
registry/facade approach. English and German are complete flat tables. English is
the default; native menus use the same catalogs. UI preference is independent of
speech locale/voice and never rewrites existing transcripts or AI results.

## Accessibility and lifecycle

Marker shape carries meaning without color alone. Interactive SVG chapters/markers
support keyboard actions; segmented tabs use roving arrow/Home/End focus. Modal focus
handling traverses Mosaik shadow roots, traps Tab, handles Escape and restores focus.
Ring animation respects reduced-motion preferences. Light/dark modes use the owner-approved Theme Editor export through public Mosaik tokens.

Do not remount capture owners to change language/theme/layout. Clean up only owned
subscriptions, timers, media and operations. Source/package E2E verifies native paths;
controlled preview data is visual evidence rather than successful AI inference.
