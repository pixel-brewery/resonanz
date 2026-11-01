# Product workflows

Resonanz turns explicitly started conversations into durable sessions. It stays
available in the system tray, records microphone audio, creates a transcript with
system speech recognition and sends requested text analysis to an installed,
authenticated assistant through Synapse. It also supports native spoken turns.

The library offers a list with a session preview and a weekly audio landscape.
Real recording amplitudes form waveforms and circular session timelines. Analysis
adds chapters, decisions, tasks and open questions. Evidence timestamps connect
claims, questions, the ring, transcript and original audio.

## Main workflows

1. Choose a microphone, start a session and mark useful moments while recording.
   Pause, resume and stop without losing acknowledged audio blocks.
2. Open the saved session. Transcribe its audio or edit/import a transcript.
3. Ask your local assistant for an analysis. Inspect each claim's original passage.
4. Ask follow-up questions using the transcript alone or the transcript with markers.
   Missing information is shown as a gap rather than a supported answer.
5. Speak a question about a saved session, or start an actual live conversation.
6. Organize sessions with titles, tags, collections and favorites. Export audio,
   structured session data or Markdown notes; delete sessions explicitly.

The window's top bar shows where you are, goes back and forward, and holds the
screen's actions; drag the window by any part of it that is not a control. The
status bar at the bottom shows a running capture, a mini player whenever a recording
or read-aloud text plays (pause, stop, open its session; playback continues while
you navigate), today's notifications behind the bell and the app version. Problems
and confirmations appear briefly at the bottom left instead of above the workspace.
When a newer installed version is published, the status bar offers to download it
and then to restart; Settings → Updates checks on request. A running capture is
never interrupted by an update.

## Language and appearance

Settings offers English and German interface languages. English is the default,
including for existing profiles without a saved interface preference. The choice
persists and updates the interface and native menus without restarting the app.
Conversation language, installed recognition languages, voice and editable
conversation instructions remain separate settings. Existing session content is
never rewritten when the interface language changes.

Soho light and dark modes can follow the system. The onboarding flow tests the
microphone and assistant only after explicit actions. Recording never starts
merely because Resonanz launches.

## Current boundaries

Native system audio capture is pending. Topic threads connect original passages
from per-session analyses; older analyses can use exact shared tags. Whole-library
inference and larger catalogs remain follow-up work. The optional floating mini
recorder controls the existing capture above other windows. Public signing,
installers, updates and broader device testing remain separate work.

See [recordings](recordings.md), [assistant setup](assistant-setup.md),
[live conversation](live-conversation.md) and the [verification record](verification.md).
