// @vitest-environment jsdom
import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSettings,
  type ISession,
  type ISessionSummary,
  type RequestPayload,
} from '@resonanz/contracts';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
import { TranslateFacade } from '../services/TranslateFacade';
import { WaveformService } from '../services/WaveformService';
import { CapturePresenter } from './CapturePresenter';
import { LibraryPresenter } from './LibraryPresenter';
import { ShellPresenter } from './ShellPresenter';

vi.mock('../services/TranslateFacade', () => ({ TranslateFacade: class TranslateFacade {} }));

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 31, 12));
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
afterAll(() => getTestBed().resetTestEnvironment());

interface IPendingDetailRead {
  readonly id: string;
  readonly snapshot: ISession;
  readonly result: ReturnType<typeof Promise.withResolvers<ISession>>;
  settled: boolean;
}

function recording(index: number, day: number, minute = 0): ISession {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const createdAt = new Date(2026, 9, day, 10, minute).toISOString();
  const text = `The release plan has a recorded task in session ${index}.`;
  const evidence = { segmentId: `speech-${index}`, atMs: 1000, endMs: 2000, quote: text };
  return {
    id,
    title: `Recording ${index}`,
    kind: 'recording',
    status: 'ready',
    createdAt,
    updatedAt: createdAt,
    durationMs: 5000,
    mimeType: 'audio/wav',
    audioBytes: 4,
    audioAvailable: true,
    audioUrl: `resonanz-audio://session/${id}`,
    starred: false,
    tags: [],
    collectionId: null,
    waveform: [0.1, 0.4],
    insightCounts: { decisions: 0, tasks: 1, questions: 0, moments: 0, forMe: 1 },
    transcriptAvailable: true,
    transcript: [
      {
        id: evidence.segmentId,
        text,
        startMs: evidence.atMs,
        endMs: evidence.endMs,
        speaker: 'participant',
        final: true,
      },
    ],
    messages: [],
    summary: '',
    nextAudioSequence: 1,
    analysis: {
      provider: 'codex',
      createdAt,
      summary: [],
      decisions: [],
      tasks: [{ id: `task-${index}`, text, assignee: 'Example', evidence: [evidence] }],
      openQuestions: [],
      chapters: [],
      topics: [
        {
          id: `topic-${index}`,
          key: 'release-plan',
          title: 'Release plan',
          kind: 'task',
          text,
          assignee: 'Example',
          evidence: [evidence],
        },
      ],
    },
  };
}

function summary(session: ISession): ISessionSummary {
  return {
    id: session.id,
    title: session.title,
    kind: session.kind,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    durationMs: session.durationMs,
    mimeType: session.mimeType,
    audioBytes: session.audioBytes,
    audioAvailable: session.audioAvailable,
    starred: session.starred,
    tags: session.tags,
    collectionId: session.collectionId,
    waveform: session.waveform,
    insightCounts: session.insightCounts,
    transcriptAvailable: session.transcriptAvailable,
    pipeline: session.pipeline,
  };
}

function scope(
  initial: readonly ISession[],
  options: { view?: 'list' | 'landscape'; weekOffset?: number } = {},
) {
  const native = new Map(initial.map((session) => [session.id, session]));
  const catalog = () =>
    [...native.values()].map(summary).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sessions = signal<readonly ISessionSummary[]>(catalog());
  const queryParameters = new BehaviorSubject(convertToParamMap({}));
  const reads: IPendingDetailRead[] = [];
  const searchIds = new Set<string>();
  let maximumConcurrentReads = 0;
  const api = {
    request: vi.fn((method: string, payload: unknown): Promise<unknown> => {
      if (method === 'sessions.get') {
        const { sessionId } = payload as RequestPayload<'sessions.get'>;
        const session = native.get(sessionId);
        if (!session) return Promise.reject(new Error('Session no longer exists.'));
        const result = Promise.withResolvers<ISession>();
        reads.push({ id: sessionId, snapshot: structuredClone(session), result, settled: false });
        maximumConcurrentReads = Math.max(
          maximumConcurrentReads,
          reads.filter((read) => !read.settled).length,
        );
        return result.promise;
      }
      if (method === 'sessions.search') return Promise.resolve([...searchIds]);
      return Promise.reject(new Error(`Unexpected test operation: ${method}`));
    }),
  };
  const library = {
    sessions,
    collections: signal([]),
    settings: signal({ ...structuredClone(defaultSettings), userName: 'Example' }),
    refresh: vi.fn(async () => sessions.set(catalog())),
    report: vi.fn(),
  };
  const waveforms = {
    cache: signal<ReadonlyMap<string, readonly number[]>>(new Map()),
    load: vi.fn(async (session: ISession): Promise<readonly number[]> => session.waveform ?? []),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      LibraryPresenter,
      { provide: DesktopApi, useValue: api },
      { provide: LibraryStore, useValue: library },
      { provide: NativeTranscriptionService, useValue: { transcribe: vi.fn() } },
      {
        provide: TranslateFacade,
        useValue: {
          locale: () => 'en-US',
          t: (key: string) => key,
          durationLabel: (duration: number) => String(duration),
        },
      },
      { provide: WaveformService, useValue: waveforms },
      { provide: CapturePresenter, useValue: { active: signal(false) } },
      { provide: ShellPresenter, useValue: { assistantName: () => 'Codex' } },
      { provide: Router, useValue: { navigate: vi.fn(async () => true) } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: queryParameters.asObservable(),
          snapshot: { queryParamMap: queryParameters.value },
        },
      },
    ],
  });
  const presenter = TestBed.inject(LibraryPresenter);
  if (options.view) presenter.view.set(options.view);
  if (options.weekOffset !== undefined) presenter.weekOffset.set(options.weekOffset);
  TestBed.tick();

  async function flush(): Promise<void> {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    TestBed.tick();
  }
  function complete(read: IPendingDetailRead, session = read.snapshot): void {
    expect(read.settled).toBe(false);
    read.settled = true;
    read.result.resolve(structuredClone(session));
  }
  async function drain(): Promise<void> {
    for (let turn = 0; turn < 250; turn++) {
      await flush();
      const pending = reads.filter((read) => !read.settled);
      if (!pending.length) return;
      for (const read of pending) complete(read);
    }
    throw new Error('Detail projection did not settle within the controlled request budget.');
  }
  function replace(session: ISession): void {
    native.set(session.id, session);
    sessions.set(catalog());
  }
  return {
    presenter,
    api,
    library,
    waveforms,
    native,
    reads,
    searchIds,
    queryParameters,
    flush,
    complete,
    drain,
    replace,
    maximumConcurrentReads: () => maximumConcurrentReads,
  };
}

describe('library detail projection', () => {
  it('loads every session in an older visible week beyond the catalog prefix, with real markers and topic evidence', async () => {
    const newer = Array.from({ length: 45 }, (_, i) => recording(i + 1, 30, i));
    const older = Array.from({ length: 45 }, (_, i) => recording(i + 100, 19 + (i % 5), i));
    const test = scope([...newer, ...older], { view: 'landscape', weekOffset: -1 });
    expect(test.reads[0]?.id).toBe(newer.at(-1)!.id);
    await test.drain();
    expect(new Set(test.reads.map((read) => read.id))).toEqual(
      new Set([newer.at(-1)!.id, ...older.map((session) => session.id)]),
    );
    expect(test.presenter.landscapeItems()).toHaveLength(45);
    expect(test.presenter.landscapeItems().every((item) => item.markers.length === 1)).toBe(true);
    expect(test.presenter.topicThreads()[0]?.points).toHaveLength(45);
    expect(new Set(test.presenter.topicThreads()[0]?.points.map((point) => point.itemId))).toEqual(
      new Set(older.map((session) => session.id)),
    );
    expect(test.maximumConcurrentReads()).toBe(2);
  });

  it('replans week, view, collection and favorite filters without replacing an existing selection', async () => {
    const collectionId = '10000000-0000-4000-8000-000000000001';
    const newer = Array.from({ length: 35 }, (_, i) => recording(i + 1, 30, i));
    const earlier = [recording(100, 20), recording(101, 21)].map((session) => ({
      ...session,
      starred: true,
      collectionId,
    }));
    const oldest = [recording(200, 13), recording(201, 14)].map((session) => ({
      ...session,
      starred: true,
      collectionId,
    }));
    const unrelated = { ...recording(300, 22), starred: true };
    const test = scope([...newer, ...earlier, ...oldest, unrelated]);
    await test.drain();
    const selected = test.presenter.selectedId();
    const priorReads = test.reads.length;
    test.queryParameters.next(convertToParamMap({ scope: 'favorites', collection: collectionId }));
    test.presenter.view.set('landscape');
    test.presenter.weekOffset.set(-1);
    TestBed.tick();
    await test.drain();
    expect(test.presenter.selectedId()).toBe(selected);
    expect(new Set(test.reads.slice(priorReads).map((read) => read.id))).toEqual(
      new Set(earlier.map((session) => session.id)),
    );
    test.presenter.weekOffset.set(-2);
    TestBed.tick();
    await test.drain();
    expect(new Set(test.presenter.landscapeItems().map((item) => item.id))).toEqual(
      new Set(oldest.map((session) => session.id)),
    );
    expect(test.presenter.landscapeItems().every((item) => item.markers.length === 1)).toBe(true);
    expect(test.reads.some((read) => read.id === unrelated.id)).toBe(false);
  });

  it('loads transcript search matches outside the original list window and prioritizes an explicit selection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 31, 12));
    const newer = Array.from({ length: 35 }, (_, i) => recording(i + 1, 30, i));
    const match = recording(100, 13);
    const test = scope([...newer, match]);
    await test.drain();
    test.searchIds.add(match.id);
    test.presenter.filterForm.query().value.set('needle in older transcript');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(180);
    TestBed.tick();
    await test.drain();
    expect(test.presenter.sessions().map((session) => session.id)).toEqual([match.id]);
    expect(test.presenter.rowMarkers(match.id)).toHaveLength(1);
    const reads = test.reads.length;
    test.presenter.select(match.id);
    TestBed.tick();
    expect(test.presenter.selected()?.id).toBe(match.id);
    expect(test.reads).toHaveLength(reads);
  });

  it('deduplicates pending reads and rejects old revisions, including retention changes with unchanged updatedAt', async () => {
    const first = recording(1, 30, 2);
    const second = recording(2, 30, 1);
    const test = scope([first, second]);
    expect(test.reads).toHaveLength(2);
    const retained = { ...first, audioAvailable: false, audioBytes: 0, audioUrl: null };
    const renamed = {
      ...second,
      title: 'New title',
      updatedAt: new Date(2026, 9, 31, 11).toISOString(),
    };
    test.native.set(first.id, retained);
    test.replace(renamed);
    test.presenter.select(second.id);
    TestBed.tick();
    expect(test.reads).toHaveLength(2);
    test.complete(test.reads[1]!);
    await test.flush();
    expect(test.reads[2]?.id).toBe(second.id);
    test.complete(test.reads[2]!);
    await test.flush();
    expect(test.presenter.selected()?.title).toBe('New title');
    test.complete(test.reads[0]!);
    await test.drain();
    expect(test.presenter.selected()?.title).toBe('New title');
    expect(test.reads.filter((read) => read.id === first.id)).toHaveLength(2);
    expect(test.reads.filter((read) => read.id === second.id)).toHaveLength(2);
    test.presenter.select(first.id);
    expect(test.presenter.selected()?.audioAvailable).toBe(false);
    expect(test.presenter.selected()?.updatedAt).toBe(first.updatedAt);
    expect(
      test.waveforms.load.mock.calls.some(
        ([session]) => session.id === first.id && session.audioAvailable,
      ),
    ).toBe(false);
    expect(
      test.waveforms.load.mock.calls.some(
        ([session]) => session.id === second.id && session.title === second.title,
      ),
    ).toBe(false);
    expect(test.maximumConcurrentReads()).toBe(2);
  });

  it('bounds waveform work with the read lane and gives a new selection the next available slot', async () => {
    const recordings = Array.from({ length: 8 }, (_, i) => recording(i + 1, 30, i));
    const test = scope(recordings);
    const waveformWork: ReturnType<typeof Promise.withResolvers<readonly number[]>>[] = [];
    test.waveforms.load.mockImplementation(() => {
      const work = Promise.withResolvers<readonly number[]>();
      waveformWork.push(work);
      return work.promise;
    });
    for (const read of [...test.reads]) test.complete(read);
    await test.flush();
    expect(test.reads).toHaveLength(2);
    expect(waveformWork).toHaveLength(2);
    test.presenter.select(recordings[0]!.id);
    waveformWork[0]!.resolve([0.2]);
    await test.flush();
    expect(test.reads[2]?.id).toBe(recordings[0]!.id);
    expect(test.presenter.rowMarkers(recordings.at(-1)!.id)).toHaveLength(1);
    TestBed.resetTestingModule();
    for (const read of test.reads.filter((read) => !read.settled)) test.complete(read);
    for (const work of waveformWork) work.resolve([]);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(test.reads).toHaveLength(3);
    expect(test.library.report).not.toHaveBeenCalled();
  });

  it('drops deleted or off-week responses before they can repopulate the detail cache', async () => {
    const selected = recording(1, 30, 2);
    const departing = recording(2, 30, 1);
    const earlier = [recording(3, 20), recording(4, 21)];
    const test = scope([selected, departing, ...earlier], { view: 'landscape' });
    const late = test.reads.find((read) => read.id === departing.id)!;
    test.native.delete(departing.id);
    test.library.sessions.set([...test.native.values()].map(summary));
    test.presenter.weekOffset.set(-1);
    // The native response can beat Angular's next effect flush.
    test.complete(late);
    await test.drain();
    expect(test.presenter.rowMarkers(departing.id)).toEqual([]);
    expect(test.waveforms.load.mock.calls.some(([session]) => session.id === departing.id)).toBe(
      false,
    );
    expect(test.presenter.landscapeItems().every((item) => item.markers.length === 1)).toBe(true);
    test.native.delete(selected.id);
    test.library.sessions.set([...test.native.values()].map(summary));
    TestBed.tick();
    expect(test.presenter.selectedId()).toBe(earlier[0]!.id);
    expect(test.presenter.rowMarkers(selected.id)).toEqual([]);
  });

  it('keeps the complete active week but evicts old off-view details beyond the recent cache', async () => {
    const firstWeek = Array.from({ length: 40 }, (_, i) => recording(i + 1, 26 + (i % 5), i));
    const earlierWeek = Array.from({ length: 40 }, (_, i) => recording(i + 100, 19 + (i % 5), i));
    const test = scope([...firstWeek, ...earlierWeek], { view: 'landscape' });
    await test.drain();
    const pinned = test.presenter.selectedId();
    test.presenter.weekOffset.set(-1);
    TestBed.tick();
    await test.drain();
    expect(test.presenter.landscapeItems()).toHaveLength(40);
    expect(test.presenter.landscapeItems().every((item) => item.markers.length === 1)).toBe(true);
    expect(
      firstWeek.filter(
        (session) => session.id !== pinned && test.presenter.rowMarkers(session.id).length,
      ),
    ).toHaveLength(30);
    const evicted = firstWeek.find(
      (session) => session.id !== pinned && !test.presenter.rowMarkers(session.id).length,
    )!;
    const priorReads = test.reads.length;
    test.presenter.select(evicted.id);
    expect(test.reads[priorReads]?.id).toBe(evicted.id);
    await test.drain();
    expect(test.presenter.selected()?.id).toBe(evicted.id);
    expect(test.presenter.landscapeItems().every((item) => item.markers.length === 1)).toBe(true);
  });

  it('does not retry a failed revision in a loop and ignores late results after disposal', async () => {
    const recordings = Array.from({ length: 5 }, (_, i) => recording(i + 1, 30, i));
    const test = scope(recordings);
    const failed = test.reads[0]!;
    failed.settled = true;
    failed.result.reject(new Error('Controlled native read failure.'));
    await test.drain();
    expect(test.library.report).toHaveBeenCalledTimes(1);
    expect(test.reads.filter((read) => read.id === failed.id)).toHaveLength(1);
    test.presenter.select(failed.id);
    await test.drain();
    expect(test.presenter.selected()?.id).toBe(failed.id);
    expect(test.reads.filter((read) => read.id === failed.id)).toHaveLength(2);
    const before = test.waveforms.load.mock.calls.length;
    test.replace({ ...test.native.get(failed.id)!, audioAvailable: false });
    TestBed.tick();
    const late = test.reads.at(-1)!;
    expect(late.settled).toBe(false);
    TestBed.resetTestingModule();
    test.complete(late);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(test.presenter.selected()).toBeNull();
    expect(test.waveforms.load).toHaveBeenCalledTimes(before);
    expect(test.library.report).toHaveBeenCalledTimes(1);
  });

  it('uses local Monday boundaries through the DST-ending Sunday rather than a fixed seven-day duration', async () => {
    vi.stubEnv('TZ', 'Europe/Berlin');
    vi.setSystemTime(new Date(2026, 9, 31, 12));
    const sunday: ISession = { ...recording(1, 25), createdAt: '2026-10-25T23:30:00+01:00' };
    const monday: ISession = { ...recording(2, 26), createdAt: '2026-10-26T00:15:00+01:00' };
    const test = scope([sunday, monday], { view: 'landscape', weekOffset: -1 });
    await test.drain();
    expect(test.presenter.weekSessions().map((session) => session.id)).toEqual([sunday.id]);
    expect(test.presenter.landscapeItems()[0]?.markers).toHaveLength(1);
  });
});
