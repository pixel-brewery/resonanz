# Recording, speech output and conversation audio

## Unchanged Flamox sources

`@resonanz/audio` contains 51 production files and 12 supplied behavior specs copied
byte-for-byte from Flamox. [The provenance manifest](../../../libs/audio/provenance.json)
records revision, original/copied paths and SHA-256 hashes. Preserve complete upstream
notices and license text. Product adaptations belong outside the copied file set.

| Primitive               | Responsibility                                        |
| ----------------------- | ----------------------------------------------------- |
| AudioInputDeviceService | Microphone discovery and device permission            |
| AudioRecorder           | MediaRecorder stream, ordered chunks and finalization |
| PcmAudioCapture         | Bounded PCM samples for level/activity                |
| PcmAudioStreamPlayer    | Buffered PCM playback                                 |
| AudioPlayer             | Saved recording playback                              |
| TextToSpeechService     | Browser/system reading of saved text                  |
| DurableAudioChunkOutbox | Shared IndexedDB outbox primitive                     |

The static worklet loader emits the unchanged processor definition as a local asset.
`tools/generate-audio-worklet.mjs --check` verifies it; the script policy need not
allow blob scripts. WaveformService decodes protected local recordings in a bounded,
serialized path and caches measured normalized peaks. Missing/silent data is not
replaced with decorative random amplitude.

## Keyless live composition

The renderer owns capture, PCM, playback and ConversationAudioRecorder's stereo graph.
Main owns system recognition and native WAV clips. Utility owns session context and
Synapse turns. No Flamox cloud audio billing/key setup is introduced.

Final `speech.result` participant segments are persisted before confirmation.
`live.respond` starts actual Synapse work. Ordered speakable response sections are
synthesized and played through protected clip URLs. Microphone and actual output
occupy separate archive channels. Only fully played sections are confirmed in the
assistant transcript. Interrupted partial sound remains in audio; its unheard rest
is never claimed as spoken. Live capture and the native recognizer use the same
system-default microphone source.

A shared AudioCaptureLease prevents parallel recording/live/preview/dictation owners.
Generation/session/run/clip identities reject late work. Recognition is coordinated
around native output; mute stops native listening as well as the archive input.
Pause/stop release the microphone and recognition, await the final browser chunk and
finalize only after acknowledged writes. Cleanup affects owned resources only.

OrderedAudioChunkWriter starts at sequence 1 and bounds queued audio to 16 MiB.
Backpressure stops further capture rather than silently dropping accepted blocks.
Host writes reject gaps/changed retries and accept identical retries idempotently.

## Transcription and reading

Automatic file transcription is a separate setting and runs after recording ends.
Availability, selected speech locale and OS permissions remain independent from
stored audio. macOS uses native file recognition. Windows receives locally decoded
mono 16 kHz PCM16 WAV up to 64 MiB. It collects results through RecognizeCompleted,
including the final passage at WAV EOF; repeated recognition beyond EOF can fail.
See the [System.Speech API documentation](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.setinputtowavefile?view=netframework-4.8.1).

Saved summary/answer reading uses unchanged TextToSpeechService, including its voice,
rate, pitch, volume and cancellation behavior. Native live clips are separate so
heard speech can be included in the stereo archive. Selected native voices are mapped
to the public TTS voice-name option without accessing private audio implementation.

## Speech-rate preference

The optional persisted `speechRate` preference is finite, between 0.5 and 2, with
neutral value 1. It controls subsequent output; saving a new value does not alter
existing recordings or already requested utterances. Saved-text reading passes it
through the copied Flamox service's public `ITextToSpeechOptions.rate` option.
No copied source is modified.

Native live synthesis reads current settings for every requested WAV clip, so it
does not require a second IPC preference or a renderer-side speech owner. The
installed `electron-native-speech` packages provide recognition, not synthesis;
Resonanz retains its existing operating-system output composition:

- macOS `say(1)` defines `-r` in words per minute. Neutral omits that option and
  preserves the selected voice's default. Other values map to a 180-WPM reference
  (`round(180 * speechRate)`), followed by the existing local WAV conversion.
- Windows maps the preference to `round(10 * log2(speechRate))` and sets the native
  [System.Speech `SpeechSynthesizer.Rate`](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.rate?view=netframework-4.8.1),
  whose supported integer range is -10 through 10. Neutral maps to zero.

These native scales and the browser speech factor are different; the control
represents a calm-to-brisk preference, not identical physical speed across voices
or platforms. Controlled specs cover parameter mapping, legacy defaults and the
unchanged-clip invariant. They do not establish actual audible pacing or Windows
native execution; those require separate runtime evidence.

Provenance checks prove copied bytes. Unit/controlled media tests prove their own
contracts. Physical recognition, native account inference, actual system output and
archive energy each require separate [runtime evidence](../../project/verification.md).
