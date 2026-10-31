// #region Imports
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveSpeechResult, SpeechError, SpeechSession } from 'electron-native-speech';
import {
  dataSchemas,
  defaultSettings,
  type AppEvent,
  type ITranscriptSegment,
} from '@resonanz/contracts';
import { NativeSpeechService } from './NativeSpeechService.js';
// #endregion

type SpeechResult = Extract<AppEvent, { type: 'speech.result' }>;
const finals = (events: readonly AppEvent[]): SpeechResult[] =>
  events.filter((event): event is SpeechResult => event.type === 'speech.result' && event.final);

const services: NativeSpeechService[] = [];
const roots: string[] = [];
function recognizer() {
  let result: ((value: LiveSpeechResult) => void) | undefined;
  let error: ((value: SpeechError) => void) | undefined;
  const native = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    abort: vi.fn(async () => {
      error?.({ code: 'invalid-state', message: 'intentional abort' });
    }),
    dispose: vi.fn(async () => undefined),
    on: (event: string, listener: unknown) => {
      if (event === 'result') result = listener as typeof result;
      if (event === 'error') error = listener as typeof error;
      return () => undefined;
    },
  } satisfies SpeechSession;
  return {
    native,
    result: (text: string, isFinal = false) => result?.({ text, isFinal }),
    error: () => error?.({ code: 'backend-failure', message: 'actual failure' }),
  };
}

async function setup() {
  await mkdir('.codex-work/speech-tests', { recursive: true });
  const directory = await mkdtemp(resolve('.codex-work/speech-tests/run-'));
  roots.push(directory);
  const session = dataSchemas.session.parse({
    id: randomUUID(),
    title: 'Gespräch',
    kind: 'conversation',
    status: 'recording',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    durationMs: 5000,
    mimeType: 'audio/webm',
    audioBytes: 0,
    audioAvailable: false,
    starred: false,
    tags: [],
    collectionId: null,
    transcript: [],
    messages: [],
    summary: '',
    nextAudioSequence: 1,
    audioUrl: null,
  });
  const first = recognizer();
  const second = recognizer();
  const createSession = vi
    .fn<() => Promise<SpeechSession>>()
    .mockResolvedValueOnce(first.native)
    .mockResolvedValue(second.native);
  const events: AppEvent[] = [];
  const persist = vi.fn(async (_sessionId: string, _segment: ITranscriptSegment) => undefined);
  const sessionPort = vi.fn(async () => session);
  const speech = new NativeSpeechService({
    dataDirectory: directory,
    windowsScript: 'not-used-by-controlled-fixture',
    session: sessionPort,
    settings: async () => defaultSettings,
    persist,
    publish: (event) => events.push(event),
    createSession,
  });
  services.push(speech);
  return { session, first, second, createSession, events, persist, sessionPort, speech };
}

beforeEach(() =>
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] }),
);
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose();
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('NativeSpeechService endpoint and ownership', () => {
  it('aborts a rejected native start before disposal and ignores its late events on retry', async () => {
    const { speech, session, first, second, events } = await setup();
    const failure = new Error('native start timed out');
    const cleanup: string[] = [];
    first.native.start.mockRejectedValueOnce(failure);
    first.native.abort.mockImplementationOnce(async () => {
      cleanup.push('abort');
    });
    first.native.dispose.mockImplementationOnce(async () => {
      cleanup.push('dispose');
    });
    await expect(speech.start(session.id)).rejects.toBe(failure);
    expect(cleanup).toEqual(['abort', 'dispose']);
    await speech.start(session.id);
    first.result('Verspäteter Beitrag des fehlgeschlagenen Starts', true);
    first.error();
    expect(events).toEqual([]);
    expect(second.native.start).toHaveBeenCalledTimes(1);
  });

  it('commits stable cumulative text once before publishing final, including repeated identical partials', async () => {
    const { speech, session, first, persist, events } = await setup();
    await speech.start(session.id);
    first.result('Wir liefern');
    await vi.advanceTimersByTimeAsync(400);
    first.result('Wir liefern am Freitag.');
    await vi.advanceTimersByTimeAsync(500);
    first.result('Wir liefern am Freitag.');
    await vi.advanceTimersByTimeAsync(400);
    expect(persist).toHaveBeenCalledTimes(1);
    const final = finals(events);
    expect(final).toHaveLength(1);
    expect(final[0]).toMatchObject({
      text: 'Wir liefern am Freitag.',
      startMs: expect.any(Number),
    });
    expect(persist.mock.calls[0]?.[1].id).toBe(final[0]?.id);
    first.result('Wir liefern am Freitag.', true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'speech.error')).toBe(false);
  });

  it('flushes only after persistence, ignores an old generation and continues the logical timeline', async () => {
    const { speech, session, first, second, persist, events } = await setup();
    await speech.start(session.id);
    first.result('Erster Beitrag');
    await speech.listen(session.id, false);
    expect(persist).toHaveBeenCalledTimes(1);
    const firstFinal = finals(events)[0];
    await vi.advanceTimersByTimeAsync(2000);
    await speech.listen(session.id, true);
    first.result('Verspätetes altes Ergebnis', true);
    first.error();
    second.result('Zweiter Beitrag', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]?.[1].id).not.toBe(firstFinal?.id);
    expect(persist.mock.calls[1]?.[1].endMs).toBeGreaterThanOrEqual(7000);
    expect(events.some((event) => event.type === 'speech.error')).toBe(false);
  });

  it('does not announce a final turn when persistence failed and can retry the same pending id', async () => {
    const { speech, session, first, persist, events } = await setup();
    await speech.start(session.id);
    first.result('Bitte speichern');
    persist.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(speech.flush(session.id)).rejects.toThrow('disk unavailable');
    expect(events.some((event) => event.type === 'speech.result' && event.final)).toBe(false);
    await speech.flush(session.id);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]?.[1].id).toBe(persist.mock.calls[0]?.[1].id);
    expect(events.filter((event) => event.type === 'speech.result' && event.final)).toHaveLength(1);
  });

  it('stops and disposes the recognizer before a session can no longer be resumed', async () => {
    const { speech, session, first, createSession } = await setup();
    await speech.start(session.id);
    await speech.closeSession(session.id);
    expect(first.native.abort).toHaveBeenCalledTimes(1);
    expect(first.native.dispose).toHaveBeenCalledTimes(1);
    await expect(speech.listen(session.id, true)).rejects.toThrow('Starte zuerst');
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('cancels a synthesis admitted before asynchronous session lookup without starting a system process', async () => {
    const { speech, session, sessionPort } = await setup();
    let release!: (value: typeof session) => void;
    sessionPort.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const synthesis = speech.synthesize(session.id, randomUUID(), 'Hallo');
    const rejected = expect(synthesis).rejects.toThrow('abgebrochen');
    const cancelled = speech.cancel(session.id);
    release(session);
    await rejected;
    await cancelled;
  });
});
