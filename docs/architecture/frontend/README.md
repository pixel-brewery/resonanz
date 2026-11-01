# Angular frontend

The renderer uses standalone Angular components, OnPush, Signals, Signal Forms and
focused presenters. Markup, TypeScript and SCSS live in matching files. Public Mosaik
Angular components supply controls, Reicon/provider icons and the Soho-based Resonanz
light/dark themes. AppearanceService follows the system or a saved preference.

## Feature ownership

- ShellPresenter owns navigation, the shared capture panel, native tray projection and
  which surfaces show the toolbar and status bar.
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

## Window chrome, notifications and playback

The workspace follows Symphony's window chrome. `ShellView` renders one unified
window toolbar above the routed workspace: back/forward (`NavigationHistory`), the
current screen's title and subtitle, and its contextual actions. Screens hand these
to the toolbar through `WindowToolbarDirective` on an `ng-template`
(`WindowToolbar` keeps owned registrations, so a late-destroyed screen cannot clear
its successor). Library and Session register their toolbars; Voice, Settings and
Onboarding keep their own title bars. Every title bar carries
`part="window-drag-region"`; one global rule makes all of it drag the window and
exempts only controls (buttons, fields, tabs, menus, `part="window-no-drag"`).

`StatusBarView` spans the bottom of the window on every surface except setup:

- the running capture (recording dot, elapsed time, live-conversation stage, pause,
  resume, stop, interrupt and mute) while the capture panel is closed;
- the mini player (`PlaybackStore`) for any playback: a session recording on the
  shared `AudioPlayer` or text read by the system voice. It pauses/resumes, stops and
  opens the playing session. Plain playback and reading continue while the person
  navigates; an excerpt or the 90-second digest pauses with its session screen
  because its clip bounds belong there. Starting a capture pauses playback;
- the notification bell with today's notices (`NotificationHistory`), the version
  and the update control (`UpdateStore`): download with a progress ring, then
  restart. Settings → Updates shows the same state and checks on request.

`NotificationService` replaces banners above the workspace. `LibraryStore.report`
and update/session states become a toast at the bottom left (Mosaik `ToastService`
behind the `NOTIFICATION_TOASTS` binding) plus an entry in the bell. Notices that
arrive in the background stay unread. Application errors keep their stable message
key as the title; external text stays content. A persisted session error is
reported once per window lifetime. The silence reminder floats above the status
bar instead of pushing the workspace down.

[Reusable components](components.md) render inputs and emit selection/actions. They
have no Synapse, filesystem, credential, persistence or capture ownership. Structured
claims/evidence stay in shared contracts; session-to-visual projections stay outside
the drawing components. The renderer calls only the typed preload API.

## Language

[Theming](theming.md) records the owner-approved export and shared provider.

[Internationalization](internationalization.md) follows the established Mosaik translation
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
