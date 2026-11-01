// @vitest-environment jsdom
import '@angular/compiler';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Subject } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  defaultSettings,
  type AppEvent,
  type IQuestionMessage,
  type ISession,
  type ITranscriptEvidence,
} from '@resonanz/contracts';
import { translate, translateMessage, type TranslationKey } from '@resonanz/intl';
import { AudioCaptureLease } from '../audio/AudioCaptureLease';
import { DesktopApi } from '../services/DesktopApi';
import { TranslateFacade } from '../services/TranslateFacade';
import { CapturePresenter } from './CapturePresenter';
import { SessionPresenter } from './SessionPresenter';
import { VoicePresenter } from './VoicePresenter';

vi.mock('../services/TranslateFacade', () => ({ TranslateFacade: class TranslateFacade {} }));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE: ITranscriptEvidence = {
  segmentId: 'segment',
  atMs: 30_000,
  endMs: 35_000,
  quote: 'The original evidence.',
};

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterEach(() => TestBed.resetTestingModule());
afterAll(() => getTestBed().resetTestEnvironment());

function scope() {
  const value = signal<ISession>({
    id: SESSION_ID,
    title: 'Controlled voice session',
    kind: 'recording',
    status: 'ready',
    createdAt: '2026-10-31T10:00:00.000Z',
    updatedAt: '2026-10-31T10:00:00.000Z',
    durationMs: 100_000,
    mimeType: 'audio/wav',
    audioBytes: 4,
    audioAvailable: true,
    audioUrl: `resonanz-audio://session/${SESSION_ID}`,
    starred: false,
    tags: [],
    collectionId: null,
    transcript: [
      {
        id: EVIDENCE.segmentId,
        text: EVIDENCE.quote,
        startMs: EVIDENCE.atMs,
        endMs: EVIDENCE.endMs,
        speaker: 'participant',
        final: true,
      },
    ],
    messages: [],
    summary: '',
    nextAudioSequence: 2,
  });
  const events = new Subject<AppEvent>();
  const pendingRunId = signal<string | null>(null);
  const isPlaying = signal(false);
  const currentTime = signal(0);
  const selectedEvidence = signal<ITranscriptEvidence | null>(null);
  const library = {
    events: events.asObservable(),
    report: vi.fn(),
    settings: signal(structuredClone(defaultSettings)),
    capabilities: signal({ platform: 'darwin', nativeConversation: true }),
  };
  const player = { isPlaying, currentTime, pause: vi.fn(() => isPlaying.set(false)) };
  let serial = 0;
  const session = {
    session: value,
    library,
    player,
    pendingRunId,
    selectedEvidence,
    liveHere: signal(false),
    hasTranscript: signal(true),
    running: computed(() => pendingRunId() !== null),
    chapters: signal([]),
    assistantName: signal('Codex'),
    askSuggested: vi.fn(async (_text: string) => {
      pendingRunId.set(`run-${++serial}`);
    }),
    cancelRun: vi.fn(async () => pendingRunId.set(null)),
    stopSpeaking: vi.fn(),
    speak: vi.fn(async (_text: string) => undefined),
    selectEvidence: vi.fn(async (evidence: ITranscriptEvidence) => {
      selectedEvidence.set(evidence);
    }),
    playExcerpt: vi.fn(async (evidence: ITranscriptEvidence) => {
      selectedEvidence.set(evidence);
      currentTime.set(Math.max(0, evidence.atMs - 5000) / 1000);
      isPlaying.set(true);
    }),
    togglePlayback: vi.fn(async () => isPlaying.set(!isPlaying())),
    refresh: vi.fn(async () => undefined),
  };
  const capture = {
    active: signal(false),
    busy: signal(false),
    state: signal('idle'),
    live: signal({
      stage: 'idle',
      participantDraft: '',
      assistantDraft: '',
      microphoneMuted: false,
    }),
    resume: vi.fn(async () => undefined),
    interrupt: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    startLive: vi.fn(async () => undefined),
  };
  const api = {
    request: vi.fn(async (_method: string, _payload: unknown): Promise<unknown> => ({ ok: true })),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      VoicePresenter,
      AudioCaptureLease,
      { provide: DesktopApi, useValue: api },
      { provide: SessionPresenter, useValue: session },
      { provide: CapturePresenter, useValue: capture },
      {
        provide: TranslateFacade,
        useValue: {
          t: (key: TranslationKey, ...parameters: readonly (string | number)[]) =>
            translate('en', key, ...parameters),
          message: (key: string) => translateMessage('en', key),
          durationLabel: (ms: number) => `${ms} ms`,
          locale: () => 'en-US',
        },
      },
    ],
  });
  const presenter = TestBed.inject(VoicePresenter);
  const lease = TestBed.inject(AudioCaptureLease);
  TestBed.tick();
  function answer(runId: string, gap = false): IQuestionMessage {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: gap ? 'This was not discussed.' : 'An evidenced answer.',
      createdAt: '2026-10-31T10:00:01.000Z',
      state: 'complete',
      runId,
      answer: {
        kind: gap ? 'gap' : 'evidenced',
        claims: [
          {
            id: 'claim',
            text: gap ? 'This was not discussed.' : 'An evidenced answer.',
            evidence: gap ? [] : [EVIDENCE],
          },
        ],
        related: gap ? [EVIDENCE] : [],
      },
    };
  }
  function complete(message: IQuestionMessage): void {
    value.update((previous) => ({ ...previous, messages: [...previous.messages, message] }));
    pendingRunId.set(null);
    TestBed.tick();
  }
  function operation(): { sessionId: string; operationId: string } {
    return api.request.mock.calls.find(([method]) => method === 'dictation.start')![1] as {
      sessionId: string;
      operationId: string;
    };
  }
  function recognized(text: string, operationId = operation().operationId): void {
    events.next({
      type: 'speech.result',
      sessionId: SESSION_ID,
      operationId,
      id: 'recognized',
      text,
      final: true,
      startMs: 0,
      endMs: 1000,
    });
  }
  return {
    presenter,
    session,
    capture,
    api,
    events,
    value,
    pendingRunId,
    isPlaying,
    currentTime,
    lease,
    answer,
    complete,
    operation,
    recognized,
  };
}

async function settle(): Promise<void> {
  for (let count = 0; count < 8; count++) await Promise.resolve();
}

describe('VoicePresenter', () => {
  it('accepts only its native operation and keeps the microphone lease until native stop acknowledges', async () => {
    const test = scope();
    await test.presenter.microphone();
    const stopped = Promise.withResolvers<unknown>();
    test.api.request.mockImplementation(async (method) =>
      method === 'dictation.stop' ? await stopped.promise : { ok: true },
    );

    test.recognized('Foreign question', 'foreign-operation');
    expect(test.presenter.draft()).toBe('');
    test.recognized('What was decided?');
    expect(test.presenter.stopping()).toBe(true);
    expect(() => test.lease.acquire(Symbol('other-capture'))).toThrow(
      'loc.resonanz.error.activeCapture',
    );
    expect(test.session.askSuggested).not.toHaveBeenCalled();
    stopped.resolve({ ok: true });
    await settle();

    expect(test.session.askSuggested).toHaveBeenCalledExactlyOnceWith('What was decided?');
    expect(test.presenter.stopping()).toBe(false);
    expect(test.value().transcript).toHaveLength(1);
    expect(test.value().transcript[0]?.text).toBe(EVIDENCE.quote);
  });

  it('does not submit a late final question after the voice view was destroyed', async () => {
    const test = scope();
    await test.presenter.microphone();
    const stopped = Promise.withResolvers<unknown>();
    test.api.request.mockImplementation(async (method) =>
      method === 'dictation.stop' ? await stopped.promise : { ok: true },
    );
    test.recognized('Do not submit after leaving.');

    TestBed.resetTestingModule();
    stopped.resolve({ ok: true });
    await settle();

    expect(test.session.askSuggested).not.toHaveBeenCalled();
    expect(() => test.lease.acquire(Symbol('later-capture'))).not.toThrow();
  });

  it('cancels a final question while its native stop is still pending', async () => {
    const test = scope();
    await test.presenter.microphone();
    const stopped = Promise.withResolvers<unknown>();
    test.api.request.mockImplementation(async (method) =>
      method === 'dictation.stop' ? await stopped.promise : { ok: true },
    );
    test.recognized('Cancel this question.');

    await test.presenter.microphone();
    stopped.resolve({ ok: true });
    await settle();

    expect(test.session.askSuggested).not.toHaveBeenCalled();
  });

  it('never releases another capture lease when an obsolete native start resolves late', async () => {
    const test = scope();
    const started = Promise.withResolvers<unknown>();
    test.api.request.mockImplementation(async (method) =>
      method === 'dictation.start' ? await started.promise : { ok: true },
    );
    const opening = test.presenter.microphone();
    await test.presenter.microphone();
    const laterOwner = Symbol('later-capture');
    test.lease.acquire(laterOwner);

    started.resolve({ ok: true });
    await opening;

    expect(test.lease.owns(laterOwner)).toBe(true);
    expect(test.presenter.listening()).toBe(false);
    expect(test.presenter.starting()).toBe(false);
    expect(
      test.api.request.mock.calls.filter(([method]) => method === 'dictation.stop'),
    ).toHaveLength(2);
  });

  it('reads only its correlated answer once and retains evidence during original audio playback', async () => {
    const test = scope();
    await test.presenter.ask('What was decided?');
    const runId = test.pendingRunId()!;
    test.complete(test.answer('foreign-run'));
    expect(test.presenter.lastAnswer()).toBeNull();
    expect(test.session.speak).not.toHaveBeenCalled();

    const ownAnswer = test.answer(runId);
    test.complete(ownAnswer);
    expect(test.session.speak).toHaveBeenCalledExactlyOnceWith(ownAnswer.text);
    expect(test.presenter.evidenceMs()).toEqual([EVIDENCE.atMs]);
    expect(test.presenter.state()).toBe('answer');
    await test.presenter.playOriginal();

    expect(test.presenter.originalRange()).toEqual({ startMs: 25_000, endMs: 37_000 });
    expect(test.session.playExcerpt).toHaveBeenCalledExactlyOnceWith(EVIDENCE);
    expect(test.presenter.state()).toBe('playing');
    expect(test.presenter.answer()).toBe(ownAnswer.text);
    test.currentTime.set(32);
    expect(test.presenter.activeEvidence()).toEqual(EVIDENCE);
    test.complete(test.answer('another-foreign-run'));
    expect(test.session.speak).toHaveBeenCalledOnce();
  });

  it('does not read a response that arrives after the user interrupted its question', async () => {
    const test = scope();
    await test.presenter.ask('Interrupt this question.');
    const runId = test.pendingRunId()!;

    await test.presenter.microphone();
    test.complete(test.answer(runId));

    expect(test.session.cancelRun).toHaveBeenCalledOnce();
    expect(test.session.speak).not.toHaveBeenCalled();
  });

  it('saves a gap as the original open question once, distinct from transcript evidence', async () => {
    const test = scope();
    await test.presenter.ask('Who writes the press release?');
    test.complete(test.answer(test.pendingRunId()!, true));
    const marked = Promise.withResolvers<unknown>();
    test.api.request.mockImplementation(async (method) =>
      method === 'sessions.mark' ? await marked.promise : { ok: true },
    );

    const saving = test.presenter.saveNote();
    await test.presenter.saveNote();
    expect(test.api.request).toHaveBeenCalledExactlyOnceWith('sessions.mark', {
      sessionId: SESSION_ID,
      moment: {
        id: expect.any(String),
        kind: 'question',
        origin: 'note',
        atMs: EVIDENCE.atMs,
        label: 'Who writes the press release?',
      },
    });
    expect(test.presenter.evidenceMs()).toEqual([]);
    marked.resolve({ ok: true });
    await saving;
    await test.presenter.saveNote();

    expect(test.presenter.noteSaved()).toBe(true);
    expect(test.session.refresh).toHaveBeenCalledOnce();
    expect(test.api.request).toHaveBeenCalledOnce();
  });

  it('refuses question dictation while a recording owns capture without native side effects', async () => {
    const test = scope();
    test.capture.active.set(true);

    await test.presenter.microphone();

    expect(test.api.request).not.toHaveBeenCalled();
    expect(test.session.library.report).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'loc.resonanz.error.captureBeforeQuestion' }),
    );
  });
});
