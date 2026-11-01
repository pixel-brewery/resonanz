# Recordings and sessions

## Capture

Use **New session** to open the compact tray capture panel. Select a microphone and start
explicitly. Microphone access is requested by the operating system. The level
meter shows measured input, including silence. System audio capture is currently
unavailable and its control explains that state.

During capture, edit the title, mark a decision, task, open question or general
moment, and pause/resume. Closing the panel or hiding the window keeps recording
active. Enable the optional mini recorder for compact controls above other windows.
It controls the same recording, collapses after ten seconds of idle and offers
marker feedback with Undo. It does not start a second recording.
The tray shows recording/paused state and elapsed time. Global shortcuts use
Cmd/Ctrl+Alt+R for capture, M for a marker, P for pause and Space for speaking.

Settings can remind you after five minutes without measured microphone activity.
Choose **Keep recording** or stop explicitly; Resonanz never stops because of silence.
A missing microphone callback is not counted as quiet input. Pausing, muting and
assistant speech reset the reminder window.

Enable **Mark pauses in the transcript** to keep separately labeled pause annotations.
They show observed paused time at its recording position. Paused time is excluded
from the audio. These annotations are not spoken words or answer evidence; an
unobserved pause end is shown as unknown.

Stopping drains the ordered audio queue and preserves the session. The panel
shows actual recording, transcription and analysis state rather than a simulated
percentage. Automatic transcription is configurable. Automatic analysis is a
separate preference and follows successful native file transcription.

## Transcript and analysis

Open a session from the library preview. The **Ring**, **Analysis** and **Questions**
views share the same session, audio player and evidence selection. Actual decoded
audio peaks form the waveform; missing audio does not receive invented peaks.
Select a chapter or marker to inspect context and play the original passage.

Transcribe a completed recording using installed system recognition. On Windows,
file transcription accepts WAV input up to 64 MiB, roughly 35 minutes at 16 kHz
mono. The required recognition language must be installed. A failed transcript
does not discard the recording. Manual editing/import remains available.

Analysis uses the selected native assistant. Structured output contains summary
claims, decisions, tasks, open questions and chapters. Evidence is resolved only
against actual transcript segments. Unknown references remain unverified. Old
plain-text summaries remain readable and can be analyzed again. Replacing the
transcript clears structured analysis, structured answers and native continuation
bindings so old evidence is not attached to new source text.

Transcription and analysis keep separate durable states. The library distinguishes
running transcription, analysis waiting for an assistant and transcription errors.
Recovery keeps existing audio/text usable, with context-preserving literal search,
hit counts, timestamped copying and manual retry. Recoverable analysis failures can
schedule a visible automatic attempt, starting after four minutes. It verifies the
selected native account before analysis and never starts sign-in for you. Attempts
are bounded; **Stop automatic retries** cancels pending recovery. Account/model
changes, logout, transcript replacement and deletion invalidate related pending work.
Interrupted background stages are reported after restart. Progress is indeterminate
when the native operation supplies no percentage; no completion time is invented.

The audio digest plays evidenced original clips in sequence. Its duration depends
on available passages; the “90 seconds” heading is a presentation target rather
than a guarantee about every session.

## Questions and organization

Ask typed or dictated questions against a saved session. Choose transcript-only
context or include user markers. Related passages are distinguished from evidence
for an actual answer. Dictated questions do not become source transcript entries.
An unanswered question can be saved explicitly as an open-question note. It is
separate from what was said during recording. Saved answers retain their actual
provider; older answers with unknown attribution use a generic assistant label.

Rename sessions, assign tags/collections, favorite and search titles/transcripts.
The weekly landscape uses actual session dates and waveforms. Topic threads connect
original passages in analyzed sessions; older analyses can use exact shared tags.
Tasks “for you” require explicit matching to your configured name or aliases.
Their checkboxes persist completion and retain it when equivalent tasks are analyzed again.

Audio, JSON and Markdown exports use native dialogs. JSON imports are validated;
imports receive their own session identity. Exported work that was still running
is marked interrupted on import; it never resumes automatically or restores retry
authorization. Completed content is preserved. Deleting a collection keeps its
sessions. Deleting a session requires confirmation and removes its local session
data and recording. Content already sent to an assistant's service cannot be
removed from that service by deleting the Resonanz session.

## Local storage and cleanup

Settings shows measured local library storage. Recordings, transcripts and analyses/
library data add up to the measured total; accounts and runtime caches are excluded.
**Show in Finder/Explorer** opens the existing local library folder.

Automatic recording deletion is off by default. Choose 30 or 90 days to remove only
expired completed audio. Transcripts, analyses, questions and markers remain available.
Active recording and processing are protected. Cleanup starts after changing the
policy and continues in bounded background batches.

**Delete all** opens a confirmation listing the local content to remove. Cancel keeps
it intact. Confirm permanently deletes sessions and collections while keeping assistant
accounts and settings. Finish recording/processing before clearing the library.

See [desktop architecture](../architecture/desktop/README.md),
[audio ownership](../architecture/audio/README.md) and [verification](verification.md).
