// @vitest-environment jsdom
// #region Imports
import '@angular/compiler';
import { signal } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import type { ICapabilities, ISession } from '@resonanz/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DesktopApi } from './DesktopApi';
import { LibraryStore } from './LibraryStore';
import { NativeTranscriptionService } from './NativeTranscriptionService';
// #endregion

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const MAX_BYTES = 64 * 1024 * 1024;

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});
afterAll(() => getTestBed().resetTestEnvironment());

function audio(channels: number[][], sampleRate = 16_000): AudioBuffer {
  const source = channels.map((channel) => Float32Array.from(channel));
  return {
    sampleRate,
    numberOfChannels: source.length,
    length: source[0]?.length ?? 0,
    getChannelData: vi.fn((channel: number) => source[channel]),
  } as unknown as AudioBuffer;
}

function scope(decoded = audio([[0, 0, 0, 0]]), platform = 'win32') {
  const session: ISession = {
    id: SESSION_ID,
    title: 'Native Dateitranskription',
    kind: 'recording',
    status: 'ready',
    createdAt: '2026-10-31T12:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
    durationMs: 0,
    mimeType: 'audio/webm',
    audioBytes: 4,
    audioAvailable: true,
    audioUrl: `resonanz-audio://session/${SESSION_ID}`,
    starred: false,
    tags: [],
    collectionId: null,
    transcript: [],
    messages: [],
    summary: '',
    nextAudioSequence: 2,
  };
  const capabilities = signal<ICapabilities | null>({
    platform,
    nativeTranscription: true,
    nativeConversation: true,
    speechLocales: ['de-DE'],
    speechVoices: [],
  });
  const api = {
    request: vi.fn(async (method: string, _payload: unknown): Promise<ISession> => {
      if (method === 'sessions.get' || method === 'transcription.run') return session;
      throw new Error(`Unexpected method ${method}`);
    }),
  };
  const library = { capabilities, refresh: vi.fn(async () => undefined) };
  const decode = vi.fn(async (_bytes: ArrayBuffer) => decoded);
  const close = vi.fn(async () => undefined);
  const contexts: AudioContextOptions[] = [];
  vi.stubGlobal('AudioContext', function (options: AudioContextOptions) {
    contexts.push(options);
    return { decodeAudioData: decode, close };
  });
  const fetchMock = vi.fn(async () => new Response(Uint8Array.of(1, 2, 3, 4)));
  vi.stubGlobal('fetch', fetchMock);
  TestBed.configureTestingModule({
    providers: [
      NativeTranscriptionService,
      { provide: DesktopApi, useValue: api },
      { provide: LibraryStore, useValue: library },
    ],
  });
  const service = TestBed.inject(NativeTranscriptionService);
  const wave = (): DataView => {
    const call = api.request.mock.calls.find(([method]) => method === 'transcription.run');
    const input = call?.[1] as { wavBytes?: ArrayBuffer } | undefined;
    if (!input?.wavBytes) throw new Error('No native WAV input was submitted.');
    return new DataView(input.wavBytes);
  };
  return { service, session, api, library, capabilities, decode, close, contexts, fetchMock, wave };
}

function samples(wave: DataView): number[] {
  return Array.from({ length: (wave.byteLength - 44) / 2 }, (_, index) =>
    wave.getInt16(44 + index * 2, true),
  );
}

describe('NativeTranscriptionService', () => {
  it('uses the original native macOS file without loading or converting audio in the renderer', async () => {
    const test = scope(undefined, 'darwin');

    await test.service.transcribe(SESSION_ID);

    expect(test.api.request).toHaveBeenCalledOnce();
    expect(test.api.request).toHaveBeenCalledWith('transcription.run', {
      sessionId: SESSION_ID,
    });
    expect(test.fetchMock).not.toHaveBeenCalled();
    expect(test.contexts).toEqual([]);
  });

  it('writes a complete mono 16kHz PCM16 RIFF header and downmixes all decoded channels', async () => {
    const test = scope(
      audio([
        [-1, 1, 0.5, 0.9],
        [1, 1, -0.5, -0.1],
      ]),
    );

    await test.service.transcribe(SESSION_ID);

    const wave = test.wave();
    const textAt = (offset: number, length: number) =>
      String.fromCharCode(...Array.from({ length }, (_, index) => wave.getUint8(offset + index)));
    expect(textAt(0, 4)).toBe('RIFF');
    expect(wave.getUint32(4, true)).toBe(wave.byteLength - 8);
    expect(textAt(8, 8)).toBe('WAVEfmt ');
    expect(wave.getUint32(16, true)).toBe(16);
    expect(wave.getUint16(20, true)).toBe(1);
    expect(wave.getUint16(22, true)).toBe(1);
    expect(wave.getUint32(24, true)).toBe(16_000);
    expect(wave.getUint32(28, true)).toBe(32_000);
    expect(wave.getUint16(32, true)).toBe(2);
    expect(wave.getUint16(34, true)).toBe(16);
    expect(textAt(36, 4)).toBe('data');
    expect(wave.getUint32(40, true)).toBe(wave.byteLength - 44);
    expect(samples(wave)).toEqual([0, 32767, 0, 13107]);
    expect(test.contexts).toEqual([{ sampleRate: 16_000 }]);
    expect(test.close).toHaveBeenCalledOnce();
    expect(test.session.mimeType).toBe('audio/webm');
    expect(test.session.audioBytes).toBe(4);
  });

  it('averages complete source intervals when reducing 48kHz audio to 16kHz', async () => {
    const test = scope(audio([[1, 1, -1, -1, -1, 1]], 48_000));

    await test.service.transcribe(SESSION_ID);

    expect(samples(test.wave())).toEqual([10922, -10923]);
  });

  it('interpolates lower-rate speech and clips PCM16 samples at both limits', async () => {
    const test = scope(audio([[0, 1]], 8000));

    await test.service.transcribe(SESSION_ID);

    expect(samples(test.wave())).toEqual([0, 16384, 32767, 32767]);
    test.decode.mockResolvedValueOnce(audio([[-2, 2]]));
    test.api.request.mockClear();
    await test.service.transcribe(SESSION_ID);
    expect(samples(test.wave())).toEqual([-32768, 32767]);
  });

  it('rejects a WAV above 64MiB before accessing samples or allocating its payload', async () => {
    const decoded = {
      ...audio([[0]]),
      length: Math.floor((MAX_BYTES - 44) / 2) + 1,
    } as AudioBuffer;
    const test = scope(decoded);

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.fileLimitDuration',
    );

    expect(decoded.getChannelData).not.toHaveBeenCalled();
    expect(test.close).toHaveBeenCalledOnce();
    expect(test.api.request.mock.calls.some(([method]) => method === 'transcription.run')).toBe(
      false,
    );
  });

  it('bounds the total decoded sample count before reading large multi-channel data', async () => {
    const decoded = {
      ...audio([[0], [0]]),
      length: MAX_BYTES / 2 + 1,
      sampleRate: 384_000,
    } as AudioBuffer;
    const test = scope(decoded);

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.audioDecodeSize',
    );

    expect(decoded.getChannelData).not.toHaveBeenCalled();
    expect(test.close).toHaveBeenCalledOnce();
  });

  it.each([
    { numberOfChannels: 0 },
    { numberOfChannels: 33 },
    { length: -1 },
    { length: Number.POSITIVE_INFINITY },
    { sampleRate: 0 },
    { sampleRate: Number.NaN },
  ])('rejects invalid decoded dimensions %j', async (invalid) => {
    const test = scope({ ...audio([[0]]), ...invalid } as AudioBuffer);

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.audioDecodeFormat',
    );

    expect(test.close).toHaveBeenCalledOnce();
  });

  it('refuses non-finite samples and closes the decoder without submitting native work', async () => {
    const test = scope(audio([[Number.NaN]]));

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.audioSamples',
    );

    expect(test.close).toHaveBeenCalledOnce();
    expect(test.api.request.mock.calls.some(([method]) => method === 'transcription.run')).toBe(
      false,
    );
  });

  it('checks encoded archive size before fetching it', async () => {
    const test = scope();
    Object.assign(test.session, { audioBytes: MAX_BYTES + 1 });

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.fileLimitShorten',
    );

    expect(test.fetchMock).not.toHaveBeenCalled();
    expect(test.contexts).toEqual([]);
  });

  it('rejects an oversized response declaration without decoding it', async () => {
    const test = scope();
    test.fetchMock.mockResolvedValueOnce(
      new Response(Uint8Array.of(1, 2, 3, 4), {
        headers: { 'content-length': String(MAX_BYTES + 1) },
      }),
    );

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.fileLimit',
    );

    expect(test.contexts).toEqual([]);
  });

  it('bounds streamed bytes by the native archive size and rejects truncated input', async () => {
    const test = scope();
    test.fetchMock.mockResolvedValueOnce(new Response(Uint8Array.of(1, 2, 3, 4, 5)));

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.fileTooLarge',
    );

    test.fetchMock.mockResolvedValueOnce(new Response(Uint8Array.of(1, 2)));
    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.audioIncomplete',
    );
    expect(test.contexts).toEqual([]);
  });

  it('loads only the protected session audio URL and never a remote source', async () => {
    const test = scope();
    Object.assign(test.session, { audioUrl: 'https://example.test/audio.webm' });

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.recordingMissing',
    );

    expect(test.fetchMock).not.toHaveBeenCalled();
  });

  it('closes its decoding context after a codec failure and allows a later retry', async () => {
    const test = scope();
    test.decode.mockRejectedValueOnce(new Error('unsupported codec'));

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.audioDecode',
    );
    await test.service.transcribe(SESSION_ID);

    expect(test.close).toHaveBeenCalledTimes(2);
    expect(
      test.api.request.mock.calls.filter(([method]) => method === 'transcription.run'),
    ).toHaveLength(1);
  });

  it('coalesces repeated requests and prevents simultaneous large audio preparations', async () => {
    const test = scope();
    const decoded = Promise.withResolvers<AudioBuffer>();
    test.decode.mockReturnValueOnce(decoded.promise);
    const first = test.service.transcribe(SESSION_ID);

    expect(test.service.transcribe(SESSION_ID)).toBe(first);
    await expect(test.service.transcribe('22222222-2222-4222-8222-222222222222')).rejects.toThrow(
      'loc.resonanz.error.fileTranscriptionRunning',
    );
    decoded.resolve(audio([[0]]));
    await first;

    expect(test.fetchMock).toHaveBeenCalledOnce();
    expect(
      test.api.request.mock.calls.filter(([method]) => method === 'transcription.run'),
    ).toHaveLength(1);
  });

  it('reports unavailable native speech without making any transcription request', async () => {
    const test = scope();
    test.capabilities.set({ ...test.capabilities()!, nativeTranscription: false });

    await expect(test.service.transcribe(SESSION_ID)).rejects.toThrow(
      'loc.resonanz.error.nativeUnavailable',
    );

    expect(test.api.request).not.toHaveBeenCalled();
    expect(test.fetchMock).not.toHaveBeenCalled();
  });
});
