# Reusable visual components

Each component is standalone, OnPush and split into matching TypeScript, HTML and
SCSS files under `apps/renderer/src/components`. Inputs contain presentation data;
outputs communicate intent. Session DTO conversion belongs to presenters and
`sessionVisualization.ts`, not the drawing primitives.

| Component          | Input/output contract                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| ResonanzGlyph      | Tile or standalone brand glyph                                                                               |
| Marker             | Decision diamond, task square, open-question circle or outlined user mark                                    |
| Waveform           | Measured amplitude bins, time, markers and optional seek/selection actions                                   |
| RadialTimeline     | Amplitudes, chapters, markers, playhead, evidence lines and state; chapter/marker selection                  |
| MarkerLegend       | Shape meanings, optional user mark and circular reading hint                                                 |
| InsightStatistics  | Decision/task/question counts and optional explicitly assigned task count                                    |
| WeekLandscape      | Dated recording ribbons, week/now/selection and optional thread connections; item selection                  |
| TopicThreads       | Generic thread index and original excerpt chain; thread/point selection                                      |
| SegmentedTabs      | Labeled IDs, selected ID, accessible keyboard navigation and value changes                                   |
| EvidenceChip       | Timestamp/selection and selected-change action                                                               |
| EvidencePanel      | Original quote, surrounding context and playback/transcript actions                                          |
| LevelMeter         | Actual input level history and paused state                                                                  |
| MiniRecorder       | Time/level/state and mark/pause/stop/expand actions                                                          |
| DeleteDialog       | Session identity, actual media availability and typed transcript/history deletion details; cancel/confirm    |
| SetupSteps         | Localized step IDs/descriptions, current/available indexes and navigation intent                             |
| TaskRow            | Controlled completion, label/due text and separate completion/selection actions                              |
| PipelineSteps      | Bounded stage states, optional measured progress and horizontal/vertical layout                              |
| HighlightedText    | Plain text plus a literal search phrase; highlighted spans without HTML injection                            |
| TranscriptPanel    | Timestamped entries, literal search with optional retained context/hit count, selection and projected editor |
| SilenceReminder    | Localized reminder and explicit continue/stop intent; no timer or media ownership                            |
| StorageBreakdown   | Measured byte categories, SI-unit labels and public Mosaik SegmentBar                                        |
| ConfirmationDialog | Reviewed details, busy/blocked state and confirm/cancel intent with modal focus                              |

`VisualizationModels.ts` exposes focused presentation interfaces and pure peak,
ratio, polar-coordinate and arc helpers. Empty or silent waveforms remain honest.
Labels use shared translations while caller-provided session/user text stays intact.
The modal focus directive handles Mosaik shadow-root controls without creating another
capture owner.

`AssistantLoginView` is a shared feature view under `apps/renderer/src/views`.
Settings and onboarding each provide their existing SettingsPresenter; the shared
view renders that owner's correlated native challenge and emits its existing
commands. It does not start an additional account, provider or capture owner.

## Product composition and limits

Ring, Analysis and Questions share one SessionPresenter. Selecting evidence can seek
original audio and highlight/scroll the transcript. Weekly threads connect validated
topics from per-session assistant analyses using stable language-independent keys.
Only original stored evidence can create a point; repeated references are deduplicated
and session counts are distinct from passage counts. Explicit topic resolution and
task completion determine the status. Legacy analyses retain exact shared-tag/text
connections. This is not a separate whole-library inference operation. The current
detail plan prioritizes selection and the complete visible filtered week. Two
concurrent read/decode chains retain active targets plus thirty off-view recent
details. Navigation, filters and catalog revisions replan the queue; late results
cannot restore deleted or stale details. The existing five-thousand-session catalog
is the overall bound; an unusually large single week has no separate byte budget.

The native mini recorder has a separate passive, sandboxed always-on-top window.
Only the workspace owns capture. A coalesced bounded projection supplies time, level,
state and marker feedback; session-bound actions return through Main to that owner.
The passive surface can only get its projection, request a fixed resize mode or
submit an allowed action. Ten seconds of idle collapses both the component and
its native bounds. The tray itself still resizes the existing workspace window.
An IntrinsicHeight directive measures its unconstrained content with one observer,
rounded changes and a coalesced height event. The tray view allows one native resize
request in flight; Main clamps/reanchors it without overwriting workspace history.
Idle-only menu actions are excluded from capture/processing layouts. Hiding or
restoring the native window rejects late measurements.

RadialTimeline accepts optional evidence focus and an original-audio range. Dimming,
beams and the bounded progress arc are presentation inputs, not recognition/inference.
The public PromptBox's actual submit/clear lifecycle preserves rejected drafts and
newer typing. Explicitly saved gap questions are user notes, never source speech.

Setup uses one titlebar, a numbered step rail and one scrolling content region.
Changing steps stops an explicitly started microphone probe before leaving the
audio step. Assistant checks reflect actual discovery/account observations; an
unchecked provider is not presented as signed in. A successful test belongs only
to the exact provider/account/model selection that produced it. Settings uses a
separate search form and exposes the actual registered platform shortcut keys.
Interface language remains independent of conversation language.

The handoff preferences now use their production owners:

- The capture owner observes continuous measured PCM activity. Five minutes of quiet
  offers an explicit continue/stop choice. Pause, mute, assistant speech, disabled
  reminders and missing frame callbacks reset that window. A transition-only native
  notification complements the in-app banner; neither automatically stops capture.
- Optional persisted pause annotations retain the archive offset and observed excluded
  wall duration. TranscriptPanel renders them as noninteractive nonspeech rows. They
  do not become transcript words, evidence, search matches or assistant context.
- A five-position speech-rate slider selects native pacing and saved-text read-aloud
  speed. A stored intermediate rate is preserved until the user changes it.
- Storage is measured explicitly when Settings opens, with coalesced native requests.
  The three displayed categories are recordings, transcripts and analyses/library data;
  the last combines analysis payloads with catalog/metadata framing. Totals describe
  managed logical file bytes, including owned staging files and excluding accounts,
  caches and unrelated files.
- Audio retention is opt-in: never, 30 or 90 days. SessionStore removes only completed,
  expired recordings; transcripts, analyses and questions remain. The single Utility
  scheduler processes bounded batches and avoids active sessions/provider work.
- Delete-all requires an explicit in-app confirmation. Both UI and native owners reject
  active capture/processing. Sessions and collections are cleared while settings,
  account profiles and unrelated files are preserved.

Automatic capture remains disabled because recordings require an explicit user
action. System-audio controls remain unavailable until native capture exists.

The supplied handoff remains the layout/interaction reference. The later owner-approved
warm palette and serif Theme Editor export supersede its monochrome colors and Inter type. Review both Soho modes and both
languages for overflow, keyboard focus and meaningful empty/processing/error states.
Synthetic design examples must remain isolated from user libraries and be labeled
as visual verification data.
