// @vitest-environment jsdom
import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AudioPlayer,
  TextToSpeechService,
  type IAudioPlayOptions,
  type IAudioSource,
  type ITextToSpeechOptions,
} from '@resonanz/audio';
import {
  defaultSettings,
  type AppEvent,
  type ICapabilities,
  type IQuestionMessage,
  type ISession,
  type ISettings,
  type ITranscriptEvidence,
  type RequestPayload,
} from '@resonanz/contracts';
import { CapturePresenter } from './CapturePresenter';
import { SessionPresenter } from './SessionPresenter';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
import { TranslateFacade } from '../services/TranslateFacade';
import { WaveformService } from '../services/WaveformService';

vi.mock('../services/TranslateFacade', () => ({ TranslateFacade: class TranslateFacade {} }));

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterEach(() => TestBed.resetTestingModule());
afterAll(() => getTestBed().resetTestEnvironment());

function scope(initialSession?: ISession) {
  const settings = signal<ISettings>(structuredClone(defaultSettings));
  const events = new Subject<AppEvent>();
  const library = {
    settings,
    events: events.asObservable(),
    report: vi.fn(),
    capabilities: signal<ICapabilities>({
      platform: 'darwin',
      nativeConversation: true,
      nativeTranscription: true,
      speechLocales: ['de-DE'],
      speechVoices: [{ id: 'native-anna', name: 'Anna', locale: 'de-DE' }],
    }),
  };
  const speech = {
    speak: vi.fn(async (_text: string, _options?: ITextToSpeechOptions | null) => undefined),
    stop: vi.fn(),
  };
  const isPlaying = signal(false);
  const currentTime = signal(0);
  const sourceUrl = signal<string | null>(null);
  const player = {
    isPlaying,
    currentTime,
    sourceUrl,
    error: signal(null),
    play: vi.fn(async (source?: IAudioSource, options?: IAudioPlayOptions) => {
      if (source && typeof source.src === 'string') sourceUrl.set(source.src);
      currentTime.set(options?.startAt ?? currentTime());
      isPlaying.set(true);
    }),
    pause: vi.fn(() => isPlaying.set(false)),
    stop: vi.fn(() => isPlaying.set(false)),
  };
  const sessions = new Map(initialSession ? [[initialSession.id, initialSession]] : []);
  const api = {
    request: vi.fn(async (method: string, payload?: unknown): Promise<unknown> => {
      if (method === 'sessions.get') {
        const { sessionId } = payload as RequestPayload<'sessions.get'>;
        return structuredClone(sessions.get(sessionId));
      }
      if (method === 'sessions.mark') {
        const { sessionId, moment } = payload as RequestPayload<'sessions.mark'>;
        const current = sessions.get(sessionId)!;
        const next = { ...current, moments: [...(current.moments ?? []), moment] };
        sessions.set(sessionId, next);
        return structuredClone(next);
      }
      return undefined;
    }),
  };
  const parameters = convertToParamMap(initialSession ? { id: initialSession.id } : {});
  const routeParameters = new BehaviorSubject(parameters);
  const capture = {
    active: signal(false),
    sessionId: signal<string | null>(null),
    mode: signal('recording'),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      SessionPresenter,
      { provide: TranslateFacade, useValue: { locale: () => 'en-US' } },
      { provide: DesktopApi, useValue: api },
      { provide: LibraryStore, useValue: library },
      { provide: AudioPlayer, useValue: player },
      { provide: TextToSpeechService, useValue: speech },
      { provide: NativeTranscriptionService, useValue: { activeSessionId: signal(null) } },
      { provide: WaveformService, useValue: { cache: signal(new Map()), load: vi.fn() } },
      { provide: CapturePresenter, useValue: capture },
      { provide: Router, useValue: { navigate: vi.fn(async () => true) } },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: routeParameters.asObservable(),
          queryParamMap: of(parameters),
          snapshot: { paramMap: parameters, queryParamMap: parameters },
        },
      },
    ],
  });
  const presenter = TestBed.inject(SessionPresenter);
  TestBed.tick();
  return { presenter, settings, speech, api, library, player, capture, sessions, routeParameters };
}

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE: readonly ITranscriptEvidence[] = [
  { segmentId: 'decision-segment', atMs: 20_000, endMs: 24_000, quote: 'A recorded decision.' },
  { segmentId: 'task-segment', atMs: 55_000, endMs: 59_000, quote: 'A recorded task.' },
  { segmentId: 'question-segment', atMs: 90_000, endMs: 94_000, quote: 'A recorded question.' },
];

function sessionFixture(): ISession {
  return {
    id: SESSION_ID,
    title: 'Controlled session',
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
    transcript: EVIDENCE.map((evidence) => ({
      id: evidence.segmentId,
      text: evidence.quote,
      startMs: evidence.atMs,
      endMs: evidence.endMs,
      speaker: 'participant',
      final: true,
    })),
    messages: [],
    moments: [{ id: crypto.randomUUID(), kind: 'moment', atMs: 1000, label: 'A personal marker.' }],
    summary: '',
    nextAudioSequence: 2,
    analysis: {
      provider: 'codex',
      createdAt: '2026-10-31T10:00:00.000Z',
      summary: [],
      decisions: [{ id: 'decision', text: 'Decision', evidence: [EVIDENCE[0]!] }],
      tasks: [{ id: 'task', text: 'Task', evidence: [EVIDENCE[1]!] }],
      openQuestions: [{ id: 'question', text: 'Question', evidence: [EVIDENCE[2]!] }],
      chapters: [
        { id: 'first', title: 'First chapter', summary: '', startMs: 0, endMs: 40_000 },
        { id: 'second', title: 'Second chapter', summary: '', startMs: 40_000, endMs: 70_000 },
      ],
    },
  };
}

function gapFixture(question = 'Was a launch date recorded?', related = true): ISession {
  const session = sessionFixture();
  const createdAt = '2026-10-31T10:00:00.000Z';
  return {
    ...session,
    messages: [
      { id: crypto.randomUUID(), role: 'user', state: 'complete', text: question, createdAt },
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        state: 'complete',
        text: 'The recording does not contain a launch date.',
        createdAt,
        answer: { kind: 'gap', claims: [], related: related ? [EVIDENCE[1]!] : [] },
      },
    ],
  };
}

async function loadedScope(session = sessionFixture()) {
  const test = scope(session);
  await test.presenter.refresh();
  TestBed.tick();
  test.api.request.mockClear();
  return test;
}

function gapMessage(test: ReturnType<typeof scope>): IQuestionMessage {
  return test.presenter.session()!.messages[1]!;
}

async function at(test: ReturnType<typeof scope>, seconds: number): Promise<void> {
  test.player.currentTime.set(seconds);
  TestBed.tick();
  await Promise.resolve();
  TestBed.tick();
}

describe('SessionPresenter saved-text speech preferences', () => {
  it('passes the saved rate, recognition locale and matching system voice through the unchanged public TTS API', async () => {
    const test = scope();
    test.settings.set({ ...defaultSettings, speechRate: 0.5, voice: 'native-anna' });

    await test.presenter.speak('A controlled saved answer.');

    expect(test.speech.speak).toHaveBeenCalledExactlyOnceWith('A controlled saved answer.', {
      lang: defaultSettings.locale,
      rate: 0.5,
      voiceName: 'Anna',
    });
    expect(test.api.request).not.toHaveBeenCalled();
  });

  it('applies changed preferences only to subsequent output and leaves an already requested utterance unchanged', async () => {
    const test = scope();
    const firstDone = Promise.withResolvers<void>();
    test.speech.speak.mockReturnValueOnce(firstDone.promise);
    test.settings.set({ ...defaultSettings, speechRate: 0.75 });
    const first = test.presenter.speak('First controlled answer.');

    test.settings.set({ ...defaultSettings, speechRate: 1.5 });
    expect(test.speech.speak).toHaveBeenCalledExactlyOnceWith('First controlled answer.', {
      lang: defaultSettings.locale,
      rate: 0.75,
    });
    await test.presenter.speak('Next controlled answer.');
    firstDone.resolve();
    await first;

    expect(test.speech.speak).toHaveBeenNthCalledWith(2, 'Next controlled answer.', {
      lang: defaultSettings.locale,
      rate: 1.5,
    });
    expect(test.api.request).not.toHaveBeenCalled();
  });

  it('uses neutral rate for legacy settings that have no speech-rate preference', async () => {
    const test = scope();
    const legacy = { ...defaultSettings };
    Reflect.deleteProperty(legacy, 'speechRate');
    test.settings.set(legacy);

    await test.presenter.speak('Legacy preference.');

    expect(test.speech.speak).toHaveBeenCalledWith('Legacy preference.', {
      lang: defaultSettings.locale,
      rate: 1,
    });
  });
});

describe('SessionPresenter digest selection', () => {
  it('selects each actual clip marker and containing chapter, clears missing context, and returns to overview at the actual end', async () => {
    const test = await loadedScope({ ...sessionFixture(), durationMs: 94_000 });
    await test.presenter.selectChapter(test.presenter.chapters()[1]!);

    await test.presenter.toggleDigest();

    expect(test.presenter.digestIndex()).toBe(0);
    expect(test.presenter.selectedEvidence()).toEqual(EVIDENCE[0]);
    expect(test.presenter.selectedMarker()?.id).toBe('decision:decision-segment');
    expect(test.presenter.selectedChapter()?.id).toBe('first');
    expect(test.player.play).toHaveBeenLastCalledWith(
      { src: test.presenter.session()!.audioUrl, label: 'Controlled session' },
      { startAt: 15 },
    );

    await at(test, 25);
    expect(test.presenter.digestIndex()).toBe(1);
    expect(test.presenter.selectedEvidence()).toEqual(EVIDENCE[1]);
    expect(test.presenter.selectedMarker()?.id).toBe('task:task-segment');
    expect(test.presenter.selectedChapter()?.id).toBe('second');
    expect(test.player.play).toHaveBeenLastCalledWith(undefined, { startAt: 50 });

    await at(test, 60);
    expect(test.presenter.digestIndex()).toBe(2);
    expect(test.presenter.selectedEvidence()).toEqual(EVIDENCE[2]);
    expect(test.presenter.selectedMarker()?.id).toBe('question:question-segment');
    expect(test.presenter.selectedChapter()).toBeNull();
    expect(test.presenter.selectedChapterDetails()).toBeNull();

    test.player.isPlaying.set(false);
    await at(test, 94);

    expect(test.presenter.digestPlaying()).toBe(false);
    expect(test.presenter.digestIndex()).toBe(-1);
    expect(test.presenter.selectedEvidence()).toBeNull();
    expect(test.presenter.selectedMarker()).toBeNull();
    expect(test.presenter.selectedChapter()).toBeNull();
    expect(test.presenter.positionMs()).toBe(94_000);
    expect(test.player.play).toHaveBeenCalledTimes(3);
    expect(test.api.request).not.toHaveBeenCalled();
  });

  it('retains the paused clip and its actual position without advancing after an explicit stop', async () => {
    const test = await loadedScope();
    await test.presenter.toggleDigest();
    await at(test, 22);

    await test.presenter.toggleDigest();
    await at(test, 99);

    expect(test.presenter.digestPlaying()).toBe(false);
    expect(test.presenter.digestIndex()).toBe(0);
    expect(test.presenter.selectedEvidence()).toEqual(EVIDENCE[0]);
    expect(test.presenter.selectedMarker()?.id).toBe('decision:decision-segment');
    expect(test.presenter.selectedChapter()?.id).toBe('first');
    expect(test.presenter.positionMs()).toBe(22_000);
    expect(test.player.pause).toHaveBeenCalledOnce();
    expect(test.player.play).toHaveBeenCalledOnce();
  });

  it('does not claim digest playback when recorded audio is unavailable or capture owns the session', async () => {
    const test = await loadedScope({ ...sessionFixture(), audioUrl: null, audioAvailable: false });
    await test.presenter.toggleDigest();
    expect(test.presenter.digestPlaying()).toBe(false);

    test.sessions.set(SESSION_ID, sessionFixture());
    await test.presenter.refresh();
    test.capture.sessionId.set(SESSION_ID);
    test.capture.active.set(true);
    await test.presenter.toggleDigest();

    expect(test.presenter.digestPlaying()).toBe(false);
    expect(test.player.play).not.toHaveBeenCalled();
  });

  it('clears a previous quote when a personal marker has no resolved transcript evidence', async () => {
    const test = await loadedScope();
    await test.presenter.selectEvidence(EVIDENCE[0]!);
    const marker = test.presenter.markers().find((item) => item.kind === 'moment')!;

    await test.presenter.selectMarker(marker);

    expect(test.presenter.selectedMarker()).toEqual(marker);
    expect(test.presenter.selectedEvidence()).toBeNull();
    expect(test.presenter.positionMs()).toBe(marker.atMs);
  });
});

describe('SessionPresenter selected chapter details', () => {
  it('counts each analyzed claim once in the half-open chapter interval and excludes ungrounded or outside claims', async () => {
    const session = sessionFixture();
    const analysis = session.analysis!;
    const test = await loadedScope({
      ...session,
      analysis: {
        ...analysis,
        decisions: [
          { id: 'spanning', text: 'Spanning claim', evidence: [EVIDENCE[0]!, EVIDENCE[1]!] },
          { id: 'repeated', text: 'Repeated reference', evidence: [EVIDENCE[0]!, EVIDENCE[0]!] },
        ],
        tasks: [...analysis.tasks, { id: 'ungrounded', text: 'No evidence', evidence: [] }],
        chapters: [
          { ...analysis.chapters[0]!, endMs: EVIDENCE[1]!.atMs },
          { ...analysis.chapters[1]!, startMs: EVIDENCE[1]!.atMs },
        ],
      },
    });
    expect(test.presenter.selectedChapterDetails()).toBeNull();

    await test.presenter.selectChapter(test.presenter.chapters()[0]!);
    expect(test.presenter.selectedChapterDetails()).toEqual({
      ordinal: 1,
      decisions: 2,
      tasks: 0,
      questions: 0,
    });

    await test.presenter.selectChapter(test.presenter.chapters()[1]!);
    expect(test.presenter.selectedChapterDetails()).toEqual({
      ordinal: 2,
      decisions: 1,
      tasks: 1,
      questions: 0,
    });

    await test.presenter.selectEvidence(EVIDENCE[2]!);
    expect(test.presenter.selectedChapterDetails()).toBeNull();
  });
});

describe('SessionPresenter explicit gap notes', () => {
  it('saves the original question once with its real related anchor, exposes pending state, and reloads persisted notes', async () => {
    const question = 'A'.repeat(520);
    const test = await loadedScope(gapFixture(question));
    const message = gapMessage(test);
    const pending = Promise.withResolvers<unknown>();
    const refreshed = Promise.withResolvers<unknown>();
    let waitingForRefresh = false;
    const request = test.api.request.getMockImplementation()!;
    test.api.request.mockImplementation((method, payload) => {
      if (method === 'sessions.mark') return pending.promise;
      if (method === 'sessions.get' && waitingForRefresh) return refreshed.promise;
      return request(method, payload);
    });

    const saving = test.presenter.saveGap(message);
    expect(test.presenter.savingQuestion()).toBe(message.id);
    await test.presenter.saveGap(message);
    const writes = test.api.request.mock.calls.filter(([method]) => method === 'sessions.mark');
    expect(writes).toHaveLength(1);
    const payload = writes[0]![1] as RequestPayload<'sessions.mark'>;
    expect(payload).toEqual({
      sessionId: SESSION_ID,
      moment: {
        id: expect.any(String),
        kind: 'question',
        origin: 'note',
        label: question.slice(0, 500),
        atMs: EVIDENCE[1]!.atMs,
      },
    });
    expect(test.presenter.gapSaved(message)).toBe(false);
    const committed = await request('sessions.mark', payload);
    waitingForRefresh = true;
    pending.resolve(committed);
    await Promise.resolve();
    expect(test.presenter.gapSaved(message)).toBe(true);
    await test.presenter.saveGap(message);
    expect(
      test.api.request.mock.calls.filter(([method]) => method === 'sessions.mark'),
    ).toHaveLength(1);
    refreshed.resolve(structuredClone(committed));
    await saving;

    const reloaded = gapMessage(test);
    expect(reloaded).not.toBe(message);
    expect(test.presenter.savingQuestion()).toBeNull();
    expect(test.presenter.gapSaved(reloaded)).toBe(true);
    expect(test.presenter.session()!.moments).toContainEqual(payload.moment);
    expect(test.presenter.session()!.analysis).toEqual(sessionFixture().analysis);
    await test.presenter.saveGap(reloaded);
    expect(
      test.api.request.mock.calls.filter(([method]) => method === 'sessions.mark'),
    ).toHaveLength(1);
  });

  it('recognizes a persisted question note independently of message identity, while a capture marker is not a saved note', async () => {
    const fixture = gapFixture();
    const question = fixture.messages[0]!.text;
    const captureMoment = {
      id: crypto.randomUUID(),
      kind: 'question' as const,
      atMs: 0,
      label: question,
    };
    const test = await loadedScope({ ...fixture, moments: [captureMoment] });
    expect(test.presenter.gapSaved(gapMessage(test))).toBe(false);

    test.sessions.set(SESSION_ID, {
      ...fixture,
      moments: [{ ...captureMoment, label: `${question} `, origin: 'note' }],
    });
    await test.presenter.refresh();
    test.api.request.mockClear();

    expect(test.presenter.gapSaved(gapMessage(test))).toBe(true);
    await test.presenter.saveGap(gapMessage(test));
    expect(test.api.request).not.toHaveBeenCalled();
  });

  it('rejects nonstored, stale, incomplete, nongap and capture-owned messages without writing', async () => {
    const fixture = gapFixture();
    const gap = fixture.messages[1]!;
    const test = await loadedScope({
      ...fixture,
      messages: [
        ...fixture.messages,
        { ...gap, id: crypto.randomUUID(), state: 'streaming' },
        { ...gap, id: crypto.randomUUID(), answer: { kind: 'evidenced', claims: [], related: [] } },
      ],
    });
    const stale = gapMessage(test);
    expect(test.presenter.gapQuestion({ ...stale })).toBe('');
    await test.presenter.saveGap({ ...stale });
    await test.presenter.saveGap(test.presenter.session()!.messages[0]!);
    await test.presenter.saveGap(test.presenter.session()!.messages[2]!);
    await test.presenter.saveGap(test.presenter.session()!.messages[3]!);
    expect(test.presenter.questionFor(test.presenter.session()!.messages[3]!)).toBe(
      fixture.messages[0]!.text,
    );
    expect(test.api.request).not.toHaveBeenCalled();

    await test.presenter.refresh();
    test.api.request.mockClear();
    expect(test.presenter.gapQuestion(stale)).toBe('');
    await test.presenter.saveGap(stale);
    test.capture.active.set(true);
    test.capture.sessionId.set(SESSION_ID);
    await test.presenter.saveGap(gapMessage(test));
    expect(test.api.request).not.toHaveBeenCalled();
    expect(test.presenter.savingQuestion()).toBeNull();
  });

  it('reports a failed write, allows a retry, and anchors an unrelated gap at zero without inventing evidence', async () => {
    const test = await loadedScope(gapFixture('What is missing?', false));
    const message = gapMessage(test);
    const failure = new Error('Controlled write failure');
    test.api.request.mockRejectedValueOnce(failure);

    await test.presenter.saveGap(message);
    expect(test.library.report).toHaveBeenCalledExactlyOnceWith(failure);
    expect(test.presenter.savingQuestion()).toBeNull();
    expect(test.presenter.gapSaved(message)).toBe(false);

    await test.presenter.saveGap(message);
    const writes = test.api.request.mock.calls.filter(([method]) => method === 'sessions.mark');
    expect(writes).toHaveLength(2);
    expect((writes[1]![1] as RequestPayload<'sessions.mark'>).moment.atMs).toBe(0);
    expect(test.presenter.gapSaved(gapMessage(test))).toBe(true);
    expect(gapMessage(test).answer?.related).toEqual([]);
  });

  it('keeps a pending note bound to its original session when navigation changes before acknowledgement', async () => {
    const fixture = gapFixture();
    const test = await loadedScope(fixture);
    const message = gapMessage(test);
    const pending = Promise.withResolvers<unknown>();
    const request = test.api.request.getMockImplementation()!;
    test.api.request.mockImplementation((method, payload) =>
      method === 'sessions.mark' ? pending.promise : request(method, payload),
    );
    const saving = test.presenter.saveGap(message);
    const write = test.api.request.mock.calls[0]![1] as RequestPayload<'sessions.mark'>;
    const next = { ...gapFixture(), id: crypto.randomUUID() };
    test.sessions.set(next.id, next);
    test.routeParameters.next(convertToParamMap({ id: next.id }));
    TestBed.tick();
    await test.presenter.refresh();
    const callsBeforeAcknowledgement = test.api.request.mock.calls.length;

    pending.resolve(await request('sessions.mark', write));
    await saving;

    expect(test.presenter.session()?.id).toBe(next.id);
    expect(test.presenter.gapSaved(gapMessage(test))).toBe(false);
    expect(test.presenter.gapQuestion(message)).toBe('');
    expect(test.api.request.mock.calls).toHaveLength(callsBeforeAcknowledgement);
    expect(test.presenter.savingQuestion()).toBeNull();
    expect(test.sessions.get(SESSION_ID)!.moments).toContainEqual(write.moment);
    expect(test.sessions.get(next.id)!.moments).not.toContainEqual(write.moment);
  });
});
