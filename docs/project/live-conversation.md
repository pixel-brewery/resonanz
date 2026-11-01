# Live conversation

Resonanz supports system speech recognition → authenticated Synapse CLI turn →
system speech output. The same selected Codex or Claude Code account powers
analysis, questions and spoken turns. There is no separate speech API key.

## Before starting

The operating system needs a supported recognition language, installed voice and
microphone/speech permissions. Missing capabilities are visible in Settings. On
Windows, recognition and synthesis use the supplied System.Speech bridge. Native
live recognition uses the system microphone; choosing a browser capture device
does not redirect that operating-system recognizer.

## Spoken turns

Start **Speak** or a live session explicitly. Resonanz recognizes a participant turn,
commits it to the session, requests a native assistant response and synthesizes
bounded speech clips. It archives microphone audio and the assistant clips that
were actually played as separate channels. The transcript confirms played output;
an unheard remainder is not recorded as a spoken assistant turn.

Interrupt stops owned inference/output. Mute affects microphone forwarding and the
archive. Pause/resume keeps the same session. Stop closes recognition, drains
accepted media writes and stores the session. During native output, recognition is
coordinated to avoid treating the assistant's own voice as a new participant turn.
Automatic acoustic interruption depends on room/echo behavior and needs further
device evidence.

Use **Settings → Speak → Speech rate** to adjust subsequent replies and saved-text
read-aloud. Existing recordings remain unchanged. Voices and platforms can respond
differently to the pacing preference.

## Speaking about a saved session

The session voice view can dictate a question against an existing transcript.
Its native recognition operation has its own identifier and microphone lease.
Only events belonging to that operation are accepted, and its recognized question
is not appended to the source transcript. The answer highlights evidence in the
ring and can play original audio or be saved as a user note.

A fixture preview, passing build or installed recognizer does not prove a real
spoken conversation. Recognition, account inference, native output and the archive
have separate [verification evidence](verification.md).
