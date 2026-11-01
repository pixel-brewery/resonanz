# Resonanz audio

Browser audio primitives copied from the Flamox frontend. The 51 production files
and 12 supplied behavior specifications listed in [provenance.json](provenance.json)
remain byte-identical to their documented originals. The renderer consumes this
private workspace through `@resonanz/audio`.

## Included primitives

Microphone discovery/permission, MediaRecorder recording and ordered chunks,
playback, browser/system TTS, PCM capture/conversion/playback, an IndexedDB audio
outbox and upstream browser/HTTP transcription strategies are retained. The product
uses native system transcription; retaining an upstream strategy does not enable a
cloud speech fallback.

`provideAudioServices()` registers the recorder, player, device service, PCM capture,
PCM player and default worklet loader. An optional IVoiceTranscriber can be provided
or registered through VOICE_TRANSCRIBER. TTS, the durable outbox and checksum service
retain their original root Angular registration.

The host replaces the worklet loader for a static asset under the desktop script
policy. Recording, DSP and playback implementations remain unchanged. New exports,
providers, test setup and provenance tooling are identified Resonanz composition.

## Verification

```sh
node libs/audio/verify-provenance.mjs
```

This compares every copied file to its stored SHA-256 without accessing the private
source repository. Intentional upstream updates change revision, paths, hashes and
relevant specs together. Host adaptations stay outside the copied set.

The supplied specs use Angular/jsdom with one worker, testing ordering, cancellation,
cleanup, PCM conversion, buffer bounds and persistent retries. They do not prove a
physical microphone or packaged app permissions. See
[audio architecture](../../docs/architecture/audio/README.md) and
[complete attribution](../../THIRD_PARTY_NOTICES.md).
