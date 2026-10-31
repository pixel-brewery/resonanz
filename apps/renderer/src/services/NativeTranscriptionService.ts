// #region Imports
import { Injectable, inject } from '@angular/core';
import type { ISession } from '@resonanz/contracts';
import { DesktopApi } from './DesktopApi';
import { LibraryStore } from './LibraryStore';
// #endregion

// #region Constants
const MAX_ENCODED_BYTES = 64 * 1024 * 1024;
const MAX_WAV_BYTES = 64 * 1024 * 1024;
const MAX_DECODED_SAMPLES = 64 * 1024 * 1024;
const WAV_HEADER_BYTES = 44;
const OUTPUT_SAMPLE_RATE = 16_000;
const MAX_OUTPUT_FRAMES = Math.floor((MAX_WAV_BYTES - WAV_HEADER_BYTES) / 2);
const MAX_DURATION_MS = (MAX_OUTPUT_FRAMES / OUTPUT_SAMPLE_RATE) * 1000;
const WAV_LIMIT_MESSAGE =
  'Die Windows-Dateitranskription unterstützt aktuell höchstens 64 MiB WAV-Audio (etwa 35 Minuten mono bei 16 kHz). Bitte kürze die Aufnahme.';
// #endregion

// #region Functions
/** Validates the decoded dimensions before allocating the bounded native WAV payload. */
function encodeWave(audio: AudioBuffer): ArrayBuffer {
  const channels = audio.numberOfChannels;
  const frames = audio.length;
  const sampleRate = audio.sampleRate;
  if (
    !Number.isSafeInteger(channels) ||
    channels < 1 ||
    channels > 32 ||
    !Number.isSafeInteger(frames) ||
    frames < 1 ||
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 384_000
  )
    throw new Error('Die dekodierten Audiodaten haben kein unterstütztes Format.');
  if (frames > Math.floor(MAX_DECODED_SAMPLES / channels))
    throw new Error('Die dekodierten Audiodaten sind zu umfangreich. Bitte kürze die Aufnahme.');
  const outputFrames = Math.ceil((frames * OUTPUT_SAMPLE_RATE) / sampleRate);
  if (!Number.isSafeInteger(outputFrames) || outputFrames < 1 || outputFrames > MAX_OUTPUT_FRAMES)
    throw new Error(WAV_LIMIT_MESSAGE);

  const source = Array.from({ length: channels }, (_, channel) => audio.getChannelData(channel));
  if (source.some((samples) => samples.length !== frames))
    throw new Error('Die dekodierten Audiokanäle sind unvollständig.');
  const monoAt = (frame: number): number => {
    let sum = 0;
    for (const channel of source) {
      const sample = channel[frame];
      if (sample === undefined || !Number.isFinite(sample))
        throw new Error('Die Aufnahme enthält ungültige Audiosamples.');
      sum += sample;
    }
    return sum / channels;
  };

  const dataBytes = outputFrames * 2;
  const result = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(result);
  const textAt = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index++)
      view.setUint8(offset + index, text.charCodeAt(index));
  };
  textAt(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  textAt(8, 'WAVE');
  textAt(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, OUTPUT_SAMPLE_RATE, true);
  view.setUint32(28, OUTPUT_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  textAt(36, 'data');
  view.setUint32(40, dataBytes, true);

  const ratio = sampleRate / OUTPUT_SAMPLE_RATE;
  for (let frame = 0; frame < outputFrames; frame++) {
    const start = frame * ratio;
    let sample: number;
    if (ratio >= 1) {
      // Average the covered interval so downsampling does not simply discard samples.
      const end = Math.min((frame + 1) * ratio, frames);
      let weighted = 0;
      for (let input = Math.floor(start); input < Math.ceil(end); input++) {
        const weight = Math.min(input + 1, end) - Math.max(input, start);
        if (weight > 0) weighted += monoAt(input) * weight;
      }
      sample = weighted / (end - start);
    } else {
      const left = Math.min(Math.floor(start), frames - 1);
      const right = Math.min(left + 1, frames - 1);
      const fraction = start - left;
      sample = monoAt(left) * (1 - fraction) + monoAt(right) * fraction;
    }
    const bounded = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      WAV_HEADER_BYTES + frame * 2,
      Math.round(bounded * (bounded < 0 ? 32768 : 32767)),
      true,
    );
  }
  return result;
}
// #endregion

/** Prepares Windows-native speech input without altering the recorded audio archive. */
@Injectable({ providedIn: 'root' })
export class NativeTranscriptionService {
  // #region Fields
  private readonly _api = inject(DesktopApi);
  private readonly _library = inject(LibraryStore);
  private _active: { readonly sessionId: string; readonly result: Promise<ISession> } | null = null;
  // #endregion

  // #region Methods
  /** Shares one in-flight session request and bounds decoding to one recording at a time. */
  public transcribe(sessionId: string): Promise<ISession> {
    if (this._active?.sessionId === sessionId) return this._active.result;
    if (this._active)
      return Promise.reject(new Error('Eine native Dateitranskription läuft bereits.'));
    const result = this.perform(sessionId).finally(() => {
      if (this._active?.result === result) this._active = null;
    });
    this._active = { sessionId, result };
    return result;
  }

  private async perform(sessionId: string): Promise<ISession> {
    if (!this._library.capabilities()) await this._library.refresh();
    const capabilities = this._library.capabilities();
    if (!capabilities?.nativeTranscription)
      throw new Error(
        capabilities?.speechMessage ??
          'Native Spracherkennung ist auf diesem System nicht verfügbar. Bitte die Sprachfunktionen unter Einstellungen prüfen.',
      );
    if (capabilities.platform !== 'win32')
      return this._api.request('transcription.run', { sessionId });

    const session = await this._api.request('sessions.get', { sessionId });
    if (!session.audioAvailable || session.audioUrl !== `resonanz-audio://session/${sessionId}`)
      throw new Error('Für diese Session ist keine gespeicherte Aufnahme verfügbar.');
    if (
      !Number.isSafeInteger(session.audioBytes) ||
      session.audioBytes < 1 ||
      session.audioBytes > MAX_ENCODED_BYTES
    )
      throw new Error(
        'Die Windows-Dateitranskription unterstützt aktuell Audiodateien bis 64 MiB. Bitte kürze die Aufnahme.',
      );
    if (session.durationMs > MAX_DURATION_MS) throw new Error(WAV_LIMIT_MESSAGE);

    const encoded = await this.readAudio(session.audioUrl, session.audioBytes);
    if (typeof AudioContext !== 'function')
      throw new Error(
        'Die Audiodekodierung für die native Dateitranskription ist nicht verfügbar.',
      );
    const context = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    let wavBytes: ArrayBuffer;
    try {
      let decoded: AudioBuffer;
      try {
        decoded = await context.decodeAudioData(encoded);
      } catch {
        throw new Error(
          'Die Aufnahme konnte für die native Spracherkennung nicht dekodiert werden.',
        );
      }
      wavBytes = encodeWave(decoded);
    } finally {
      await context.close().catch(() => undefined);
    }
    return this._api.request('transcription.run', { sessionId, wavBytes });
  }

  private async readAudio(url: string, expectedBytes: number): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!response.ok || !response.body)
        throw new Error('Die gespeicherte Aufnahme konnte nicht geladen werden.');
      const declared = response.headers.get('content-length');
      if (declared !== null && Number(declared) > MAX_ENCODED_BYTES)
        throw new Error('Die Windows-Dateitranskription unterstützt Audiodateien bis 64 MiB.');

      reader = response.body.getReader();
      const result = new Uint8Array(expectedBytes);
      let total = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        if (!ArrayBuffer.isView(next.value) || next.value.BYTES_PER_ELEMENT !== 1)
          throw new Error('Die gespeicherte Aufnahme enthält ungültige Audiodaten.');
        const nextTotal = total + next.value.byteLength;
        if (nextTotal > MAX_ENCODED_BYTES || nextTotal > expectedBytes)
          throw new Error('Die Aufnahme überschreitet die zulässige Größe der Dateitranskription.');
        result.set(next.value, total);
        total = nextTotal;
      }
      if (total !== expectedBytes)
        throw new Error(
          'Die gespeicherte Aufnahme ist unvollständig. Bitte lade die Session erneut.',
        );
      return result.buffer;
    } catch (error) {
      controller.abort();
      if (error instanceof DOMException && error.name === 'AbortError')
        throw new Error('Das Laden der Aufnahme für die Dateitranskription hat zu lange gedauert.');
      throw error;
    } finally {
      clearTimeout(timeout);
      if (reader) {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
  }
  // #endregion
}
