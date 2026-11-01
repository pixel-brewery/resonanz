# Desktop, sessions and native media

## Runtime owners

Angular owns views, browser microphone recording/playback and the live stereo media
graph. Its sandboxed preload exposes only `window.resonanz.request` and `onEvent`.
Requests, responses and events are independently validated using the shared Zod
catalog; response correlation IDs must match. Subscriptions return cleanup functions.
Main validates the sending window/frame and owns native dialogs, permissions,
windows/tray and one supervised Utility. The Utility owns OrchestratorApplication,
SessionStore and the long-lived Synapse AssistantService.

`tools/build-node-apps.mjs` bundles Main/Utility as ESM and preload as sandbox-compatible
CommonJS. The packaged renderer loads from `dist/apps/renderer/browser/index.html`.
Esbuild inlines workspace/Synapse dependencies and reports unexpected runtime imports.
Only the explicitly late-bound native speech dependencies remain external.

## Window, tray and shutdown

The single-instance lock reopens the existing window on a second launch. Hiding or
closing it keeps recording alive. A tray click presents the existing window as a
compact capture panel; opening the workspace restores normal bounds. The same
renderer owns media in both sizes. `WindowPresentation` selects fixed surface
geometry: workspace 1440×900, onboarding 1000×720 and Settings 1000×1180, clamped to
the current display's work area. Each surface preserves later user bounds/maximization.
The tray uses 368 content pixels with an intrinsic height clamped to its display;
coalesced renderer measurements resize/reanchor the existing window. Hiding it or
restoring the workspace rejects late height requests. Returning restores the
requested surface. Route changes do not reload, show or replace the renderer, and
fullscreen changes defer until native fullscreen exit. Main disables renderer background
throttling during active capture and restores it afterwards. The context menu offers the workspace, capture,
live conversation and quit. A timer projects current capture/processing state.

The optional mini recorder is a separate transparent, always-on-top native window.
Its renderer has a passive bootstrap with no LibraryStore, account or media owner.
The workspace coalesces a bounded time/level/state projection at 100 ms. Main trusts
the exact passive window and main frame and allowlists only `mini.get`, `mini.action`
and `mini.resize`; the passive preload independently enforces the same restriction.
Actions identify the session shown, and both Main and CapturePresenter reject stale
session commands. Fixed expanded/collapsed/feedback modes determine native dimensions.
Renderer loss and shutdown invalidate its controls. Failure of this passive surface
does not restart capture or repeatedly spawn another window.

Cmd/Ctrl+Alt+R/M/P/Space publish typed capture, marker, pause and voice commands.
Task-controlled E2E avoids registering those global shortcuts. Interface language
changes update native menus and tooltips from the shared translation tables.

Windows tray assets retain the Resonanz glyph with recording/paused badges and
light/dark variants. Capture tooltips include the actual elapsed duration;
processing tooltips include a percentage only when a stage reports one. On macOS,
one bounded timer animates eight cached recording frames over 1.6 seconds. Native
reduced-motion settings disable the pulse. Pause, stop, renderer loss and shutdown
stop it; updates for the same active session preserve its animation phase.

Quitting with active capture asks for confirmation. Main requests renderer stop and
waits for final audio acknowledgments, then closes native speech, drains Utility
writes/Synapse work and stops its owned process. Already persisted blocks survive
a renderer timeout. Renderer loss closes owned speech and marks active recordings
interrupted. Shutdown removes owned timers and shortcuts.

The supervisor admits at most 100 pending requests, with 30-second ordinary and
180-second live delegation timeouts. Unexpected exit rejects waiting requests.
Registered native children must be safely cleaned up before up to three automatic
restarts. Saved recordings survive; recognition/playback never silently resumes.

## Native process ownership

The Utility observes Node's `child_process.spawn` diagnostic channel without replacing
the Synapse runner. It reports an ownership token, PID and detached flag to Main,
without command lines, prompts or environment values. Main records bounded parent,
process-group and start-time metadata. Groups remain registered while members exist.

On POSIX, confirmed owned groups receive SIGTERM and, if necessary, SIGKILL; absence
is awaited. Reused/unconfirmed identities are never signalled. On Windows, an
identical registered root can be terminated with `taskkill /T`. If the root has
already vanished after an unexpected owner exit, descendant cleanup is unconfirmed
and automatic replacement is blocked. Normal shutdown additionally awaits Synapse's
runner cleanup.

The spawn precedes its diagnostic report: a hard crash before identity registration
is not universally orphan-safe. No OS job object or universal pre-spawn ownership
proof is claimed. Controlled silent-root/descendant tests preserve unrelated
processes; platform-specific execution evidence remains separate.

## Contract catalog

| Methods                                         | Behavior                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `bootstrap.get`                                 | Session summaries, collections, non-secret settings and native capabilities           |
| `sessions.create/get/update/delete/finish`      | Session lifecycle and organization                                                    |
| `sessions.mark/waveform/search`                 | Idempotent user markers, measured peak cache and local text search                    |
| `sessions.unmark/task/pipeline`                 | Capture-marker undo, task completion and separate durable processing stages           |
| `collections.create/update/delete`              | Collections; deletion preserves sessions                                              |
| `audio.append`                                  | Ordered, acknowledged audio journal writes                                            |
| `transcript.append/replace`                     | Speaker fragments or source replacement with evidence invalidation                    |
| `sessions.analyze/ask`                          | Admit real Synapse work and stream correlated events                                  |
| `assistant.*`                                   | Detection, exact account status, explicit native sign-in/out, bounded test and cancel |
| `speech.*`, `live.respond`                      | Native recognition/output and direct spoken Synapse turns                             |
| `dictation.start/stop`                          | Operation-scoped question recognition without altering the source transcript          |
| `transcription.run`                             | Native transcription of a completed recording                                         |
| `sessions.import/export`                        | Native dialogs and validated session/audio I/O                                        |
| `settings.save`                                 | Validated non-secret preferences                                                      |
| `window.*`, `storage.reveal`                    | Native presentation and explicit storage-folder reveal                                |
| `mini.*`                                        | Main-owned passive projection, fixed geometry and session-bound capture commands      |
| `capture.reminder`                              | One session-bound native quiet-input reminder with explicit continue/stop actions     |
| `sessions.pause/clear`, `storage.usage/cleanup` | Pause metadata, confirmed library deletion, measured storage and audio retention      |

Summaries include waveform/count projections without sending complete transcripts
or analyses for every row. Full sessions add transcript, summary, structured analysis,
user markers, messages and a protected playback URL. Absolute paths and native
continuation references are never renderer DTO fields.

Optional processing-stage state survives restart. Startup changes an interrupted
running stage to failed without removing audio or transcript. Native transcription
and actual assistant execution own their stage transitions. The UI shows a percentage
only when one exists. [Automatic analysis recovery](../local-assistants/analysis-recovery.md)
uses a durable, bounded intent after supported recoverable failures; manual retry
and cancellation remain explicit controls. Optional analysis topics carry stable
keys, original evidence and explicitly reported resolution; they are validated with
the other claims. Historical answer messages retain the executing provider rather
than taking their label from the current account selection. Saved gap notes have
`origin: note` and are not attributed to speech during capture.

Analysis/questions use caller-generated run IDs. Admission is separate from completion:
`assistant.text`, `progress`, `completed` and `failed` carry actual execution state.
One semantic run per session is allowed. Only a run that acquired `processing` may
restore it atomically. Late completion cannot reactivate paused/stopped capture.
Finishing capture cancels related live delegations and awaits cleanup.

Authentication/configuration transitions invalidate private continuations even on
failure/cancellation. A binding epoch prevents older runs from restoring invalid
references. Transcript replacement cancels runs, clears structured evidence and
continuations, and preserves readable old message text. Transcript-only questions
have their own continuation scope and omit markers/history from the selected context.

## Storage and protected media

Session documents are versioned JSON, atomically replaced alongside the catalog.
Audio is separate and ordered from sequence 1. Identical retries are idempotent;
changed retries and gaps fail. Acknowledged partial recordings can be recovered.
`resonanz-audio` accepts validated session identifiers and bounded byte ranges.
`resonanz-voice` exposes only an owned speech clip. Neither accepts arbitrary paths.

`storage.usage` measures owned logical file bytes on explicit request, never on each
bootstrap/tray poll. It reports four disjoint categories that sum exactly: recording
files/journals, serialized transcript payloads, analysis/question payloads and remaining
catalog/session framing and owned staging files. Scans reject symlinks and stay within managed file names.
Audio retention defaults to never and optionally expires completed audio after an elapsed duration of 30 or 90 days from session creation (24 hours per day). One coalesced Utility sweep removes at most 32 recordings,
then schedules another bounded batch. In-flight provider sessions, active capture and
processing are protected. Targeted session events refresh open audio controls after
cleanup. Confirmed library clearing preserves settings/accounts and unrelated files.

Optional pause annotations store an archive offset and observed excluded duration.
Idempotent upserts preserve identity/timing; a missing end stays unknown. Markdown
exports put pauses in a separate nonspeech section. They never enter transcript evidence.

`CaptureReminderNotification` owns at most one native notification for measured quiet
input. Identity deduplication and live session checks reject stale/dismissed callbacks.
The banner remains usable when OS notifications are unavailable. Main closes the notice
on pause, stop, renderer loss and shutdown. OS delivery remains separate runtime evidence.

JSON export carries metadata/transcript/analysis/questions, with separate audio export.
Reimport creates a new identity and never marks missing audio present. Imported
running stages become failed/interrupted, and imported progress/retry deadlines are
removed before persistence. Completed content remains available without admitting
background work or blocking library clearing. Native file
paths stay in Main/Utility. Native dialogs default to user-facing locations, never
to a source checkout or credential directory.

## Native speech

macOS uses `electron-native-speech`; Windows uses the supplied System.Speech/SAPI
bridge. Capabilities query installed languages/voices and report unavailable state.
No additional audio provider or key store exists. Native live recognition persists
final participant text before confirming it. Session/run/operation IDs reject stale
results and foreign dictation stops.

Synthesis produces bounded local WAV clips. The renderer receives protected URLs
and archives actually played output on its assistant channel. Recognition/output
coordination prevents deliberate self-feedback. Pause/stop await owned cleanup.
Windows file transcription decodes supported browser recordings locally into
mono 16 kHz PCM16 WAV, bounded to 64 MiB. Task-owned conversion files live under the
private app data directory and are removed on success/failure. The original archive
is unchanged. Missing speech packages do not cause cloud fallback.

## Packaging and evidence

Forge includes Resonanz icons, bundle metadata, microphone/speech usage descriptions,
the external native helper/bridge and complete MIT/upstream notices. Its staging-only
runtime manifest includes required late-bound speech packages; source workspace/vendor
metadata is preserved. Local macOS bundles are ad hoc signed.

`verify:package` compares ASAR/renderer bundles, resources, native dependencies and
license text to the current build, plus macOS helper/signature consistency. Packaged
E2E drives the actual executable. Neither proves trusted public signing, a physical
microphone on another OS or real account inference. See
[verification](../../project/verification.md) and [distribution](../../project/distribution.md).
