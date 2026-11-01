// #region Imports
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveSpeechResult, SpeechError, SpeechSession } from 'electron-native-speech';
import {
  dataSchemas,
  defaultSettings,
  type AppEvent,
  type ITranscriptSegment,
  type ISettings,
} from '@resonanz/contracts';
import { NativeSpeechService } from './NativeSpeechService.js';
// #endregion

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;

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

async function setup(overrides: Partial<ISettings> = {}) {
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
  const settings = structuredClone({ ...defaultSettings, ...overrides });
  const speech = new NativeSpeechService({
    dataDirectory: directory,
    windowsScript: 'not-used-by-controlled-fixture',
    session: sessionPort,
    settings: async () => settings,
    persist,
    publish: (event) => events.push(event),
    createSession,
  });
  services.push(speech);
  return { session, first, second, createSession, events, persist, sessionPort, speech, settings };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.mocked(spawn).mockReset();
});
afterEach(async () => {
  try {
    for (const service of services.splice(0)) await service.dispose();
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor);
    vi.useRealTimers();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  }
});

/** Controls only OS process I/O; the production synthesis/settings/file lifecycle still runs. */
function nativeCommands(platform: 'darwin' | 'win32') {
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: platform });
  const windowsInputs: {
    readonly mode: string;
    readonly configuration: Record<string, unknown>;
  }[] = [];
  vi.mocked(spawn).mockImplementation((executable, arguments_) => {
    const argumentsList = [...(arguments_ ?? [])];
    const child = new EventEmitter() as ChildProcessWithoutNullStreams;
    Object.assign(child, {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => {
        child.emit('close', 1, null);
        return true;
      }),
    });
    let input = '';
    child.stdin.on('data', (chunk) => {
      input += String(chunk);
    });
    child.stdin.once('finish', () => {
      void (async () => {
        let output = '';
        if (executable === '/usr/bin/say' && argumentsList.includes('?'))
          output = 'Anna de_DE # Controlled system voice';
        else if (executable === '/usr/bin/osascript') output = '["de-DE"]';
        else if (executable === '/usr/bin/say')
          await writeFile(
            argumentsList[argumentsList.indexOf('-o') + 1]!,
            'controlled intermediate',
          );
        else if (executable === '/usr/bin/afconvert')
          await writeFile(argumentsList.at(-1)!, silentWave());
        else {
          const mode = argumentsList[argumentsList.indexOf('-Mode') + 1]!;
          const configuration = JSON.parse(input) as Record<string, unknown>;
          windowsInputs.push({ mode, configuration });
          if (mode === 'inspect')
            output = JSON.stringify({
              locales: ['de-DE'],
              voices: [{ id: 'Anna', name: 'Anna', locale: 'de-DE' }],
            });
          else if (mode === 'synthesize') {
            await writeFile(String(configuration['outputPath']), silentWave());
            output = '{"complete":true}';
          } else throw new Error(`Unexpected controlled mode: ${mode}`);
        }
        child.stdout.end(output);
        child.emit('close', 0, null);
      })().catch((error) => {
        child.emit('error', error);
        child.emit('close', 1, null);
      });
    });
    return child;
  });
  return { windowsInputs };
}

function silentWave(): Buffer {
  const wave = Buffer.alloc(46);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(38, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(24_000, 24);
  wave.writeUInt32LE(48_000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(2, 40);
  return wave;
}

describe('NativeSpeechService speech-rate preference', () => {
  it('uses the current saved rate for each subsequent macOS clip and preserves the neutral voice default', async () => {
    nativeCommands('darwin');
    const { speech, session, settings } = await setup({ speechRate: 0.5 });
    const speechId = randomUUID();
    await speech.synthesize(session.id, speechId, 'Controlled slow clip.');
    const original = await readFile(speech.voicePath(session.id, speechId));
    Object.assign(settings, { speechRate: 2 });
    await speech.synthesize(session.id, randomUUID(), 'Controlled brisk clip.');
    Object.assign(settings, { speechRate: 1 });
    await speech.synthesize(session.id, randomUUID(), 'Controlled neutral clip.');

    const calls = vi
      .mocked(spawn)
      .mock.calls.filter(
        ([executable, arguments_]) => executable === '/usr/bin/say' && arguments_?.includes('-o'),
      );
    expect(calls).toHaveLength(3);
    expect(calls[0]?.[1]).toEqual(expect.arrayContaining(['-r', '90']));
    expect(calls[1]?.[1]).toEqual(expect.arrayContaining(['-r', '360']));
    expect(calls[2]?.[1]).not.toContain('-r');
    expect(await readFile(speech.voicePath(session.id, speechId))).toEqual(original);
  });

  it.each([
    [0.5, -10],
    [0.75, -4],
    [1, 0],
    [1.5, 6],
    [2, 10],
  ])('maps preference %s to Windows System.Speech Rate %s', async (rate, expected) => {
    const { windowsInputs } = nativeCommands('win32');
    const { speech, session } = await setup({ speechRate: rate });

    await speech.synthesize(session.id, randomUUID(), 'Controlled Windows clip.');

    expect(windowsInputs.find((input) => input.mode === 'synthesize')?.configuration).toMatchObject(
      { text: 'Controlled Windows clip.', voice: 'Anna', rate: expected },
    );
  });

  it.each([0.49, 2.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid persisted rate %s before starting system synthesis',
    async (rate) => {
      nativeCommands('darwin');
      const { speech, session, settings } = await setup();
      Object.assign(settings, { speechRate: rate });

      await expect(
        speech.synthesize(session.id, randomUUID(), 'Invalid preference.'),
      ).rejects.toThrow();

      expect(spawn).not.toHaveBeenCalled();
    },
  );
});

describe('NativeSpeechService endpoint and ownership', () => {
  it('dictates a question for a saved session without writing into its original transcript', async () => {
    const { speech, session, first, persist, events } = await setup();
    session.status = 'ready';
    session.kind = 'recording';
    const operationId = randomUUID();
    await speech.start(session.id, operationId);
    await speech.stop(session.id, randomUUID());
    expect(first.native.abort).not.toHaveBeenCalled();
    first.result('Was wurde entschieden?', true);
    await vi.runAllTimersAsync();
    expect(persist).not.toHaveBeenCalled();
    expect(finals(events)).toMatchObject([
      { operationId, text: 'Was wurde entschieden?', sessionId: session.id },
    ]);
    await speech.stop(session.id, operationId);
  });
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
    await expect(speech.listen(session.id, true)).rejects.toThrow(
      'loc.resonanz.error.recognitionStartFirst',
    );
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
    const rejected = expect(synthesis).rejects.toThrow('loc.resonanz.error.speechAborted');
    const cancelled = speech.cancel(session.id);
    release(session);
    await rejected;
    await cancelled;
  });
});
