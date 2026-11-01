# Audio provenance, capture and native speech

Read [audio architecture](../../../../docs/architecture/audio/README.md), the
[audio workspace guide](../../../../libs/audio/README.md) and
[provenance manifest](../../../../libs/audio/provenance.json) before audio changes.
Read [complete notices](../../../../THIRD_PARTY_NOTICES.md) before copied material
or font changes.

## Immutable primitives and host composition

The manifest's production files and supplied specs are byte-identical upstream
copies except the explicitly documented PCM processor identifier rename. That file
retains its original `sha256` and has a separate `downstreamSha256` plus a precise
modification description. No private upstream repository identity is published.
Do not edit or reformat copied primitives for a product change, including a
seemingly small cancellation or playback fix. Adapt through host-owned files
outside the copied set. A deliberate upstream update changes revision, original
paths, hashes and relevant tests coherently and preserves all notices.

Use public `@resonanz/audio` composition. Existing owners include
[AudioBrowserRuntime](../../../../apps/renderer/src/audio/AudioBrowserRuntime.ts),
[RecordingCoordinator](../../../../apps/renderer/src/audio/RecordingCoordinator.ts),
[LiveConversationCoordinator](../../../../apps/renderer/src/audio/LiveConversationCoordinator.ts),
[AudioCaptureLease](../../../../apps/renderer/src/audio/AudioCaptureLease.ts),
[OrderedAudioChunkWriter](../../../../apps/renderer/src/audio/OrderedAudioChunkWriter.ts)
and [TranscriptCommitQueue](../../../../apps/renderer/src/audio/TranscriptCommitQueue.ts).
Extend them instead of adding a feature-local recorder, queue or native owner.

The static worklet loader and
[generator](../../../../tools/generate-audio-worklet.mjs) satisfy desktop script
policy using the provenance-verified processor definition. Regenerate through its owner;
do not hand-edit the generated renderer asset. Retained upstream transcription
strategies do not enable a cloud fallback.

## Recording and duplex conversation

Capture starts through an explicit user action. Preview/onboarding, tray and live
conversation share an exclusive capture lease and current owners; saved-session
question dictation is blocked during active capture. Preserve chunk ordering,
bounded queues/backpressure, final flush/host acknowledgment and awaited cleanup
on pause, stop, failure and shutdown. Removing a view must not orphan a stream,
timer, AudioContext, subscription or speech operation.

Live conversation composes system recognition → persisted recognized participant
text → actual Synapse text turn → system speech output. Archive microphone and
actually played assistant output on separate stereo channels. Unplayed synthesis
or interrupted/unheard text must not be represented as spoken output. Keep model
answer history distinct from what the participant heard.

Maintain explicit mute/pause/interruption states and coordination against deliberate
self-feedback. Session/run/operation identities reject late or foreign callbacks.
Question dictation remains separate from recording transcription and live turns.
Transcription replacements retain session evidence invalidation from
[Sessions](sessions.md).

`NativeSpeechService`, `WindowsSpeechSession` and the supplied Windows speech
resource own OS capability/language discovery, conversion and speech lifecycle;
see [Desktop](desktop.md). A system voice or recognized fixture file does not prove
physical microphone input. Run `yarn verify:audio` for copy/worklet integrity and
the affected owner specs for behavior; actual recording, recognition, inference,
output and decoded stereo archive each require their own runtime evidence.
