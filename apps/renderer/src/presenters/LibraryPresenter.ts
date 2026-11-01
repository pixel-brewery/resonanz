import {
  sessionDisplayState,
  isSessionProcessing,
  needsSessionAttention,
} from './sessionProcessing';
import { groupLibrarySessions } from './libraryGrouping';
import { sessionDeletionDetails } from './sessionDeletionDetails';
import { TranslateFacade } from '../services/TranslateFacade';
// #region Imports
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { form, maxLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import type { ISession, ISessionSummary } from '@resonanz/contracts';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { CapturePresenter } from './CapturePresenter';
import { ShellPresenter } from './ShellPresenter';
import { WaveformService } from '../services/WaveformService';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
import { isMyTask, sessionMarkers, sessionTopicThreads } from './sessionVisualization';
import type { ILandscapeItem } from '../components/visualization/VisualizationModels';
// #endregion

interface ILibraryDetailRequest {
  readonly summary: ISessionSummary;
  readonly revision: string;
}

/** Projects the real library into searchable, collection-aware recording views. */
@Injectable()
export class LibraryPresenter {
  private static readonly _detailConcurrency = 2;
  private static readonly _recentDetailLimit = 30;
  private readonly _intl = inject(TranslateFacade);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _api = inject(DesktopApi);
  private readonly _transcription = inject(NativeTranscriptionService);
  private readonly _parameters = toSignal(this._route.queryParamMap, {
    initialValue: this._route.snapshot.queryParamMap,
  });
  private readonly _filterModel = signal({ query: '' });
  private readonly _collectionModel = signal({ name: '' });
  private readonly _details = signal<ReadonlyMap<string, ISession>>(new Map());
  private readonly _matches = signal<ReadonlySet<string> | null>(null);
  private readonly _detailRevisions = new Map<string, string>();
  private readonly _detailPending = new Map<string, ILibraryDetailRequest>();
  private readonly _detailFailures = new Map<string, string>();
  private _detailWanted = new Map<string, ILibraryDetailRequest>();
  private _detailQueue = new Map<string, ILibraryDetailRequest>();
  private _plannedSummaries: readonly ISessionSummary[] = [];
  private _plannedTargets: readonly ISessionSummary[] = [];
  private _destroyed = false;
  private _searchVersion = 0;
  private _searchTimer: ReturnType<typeof setTimeout> | null = null;
  public readonly waveforms = inject(WaveformService);
  public readonly selectedId = signal<string | null>(null);
  public readonly filter = signal('all');
  public readonly view = signal('list');
  public readonly weekOffset = signal(0);
  public readonly selectedThreadId = signal<string | null>(null);
  public readonly topicThreads = computed(() =>
    sessionTopicThreads(
      this.weekSessions().flatMap((session) => this._details().get(session.id) ?? []),
      this._intl.locale(),
    ),
  );
  public readonly threadDescription = computed(() =>
    this.topicThreads().some((thread) => thread.id.startsWith('topic:'))
      ? this._intl.t('loc.resonanz.landscape.topicExplain', this.shell.assistantName())
      : this._intl.t('loc.resonanz.landscape.tagExplain'),
  );
  public readonly deleting = signal(false);
  public readonly selected = computed(() => this._details().get(this.selectedId() ?? '') ?? null);
  public readonly deletionDetails = computed(() => sessionDeletionDetails(this.selected()));
  public readonly previewState = computed(() =>
    this.selected() ? sessionDisplayState(this.selected()!) : 'saved',
  );
  public readonly previewError = computed(
    () =>
      this.selected()?.pipeline?.transcription?.error ??
      this.selected()?.pipeline?.analysis?.error ??
      this.selected()?.error ??
      '',
  );
  public readonly previewAssistant = computed(() =>
    (this.selected()?.pipeline?.analysis?.provider ??
      this.library.settings().assistant.provider) === 'claude'
      ? 'Claude Code'
      : 'Codex',
  );
  public readonly markers = computed(() => sessionMarkers(this.selected()));
  public readonly previewWaveform = computed(
    () => this.waveforms.cache().get(this.selectedId() ?? '') ?? this.selected()?.waveform ?? [],
  );
  public readonly totalDuration = computed(() =>
    this.library.sessions().reduce((sum, item) => sum + item.durationMs, 0),
  );
  public readonly myTasks = computed(
    () =>
      this.selected()?.analysis?.tasks.filter((task) =>
        isMyTask(
          task,
          this.library.settings().userName ?? '',
          this.library.settings().addressedAs ?? '',
        ),
      ) ?? [],
  );
  public readonly groups = computed(() =>
    groupLibrarySessions(this.sessions(), new Date()).map((group) => ({
      ...group,
      title:
        group.id === 'today'
          ? this._intl.t('loc.resonanz.common.today')
          : group.id === 'yesterday'
            ? this._intl.t('loc.resonanz.common.yesterday')
            : group.id === 'thisWeek'
              ? this._intl.t('loc.resonanz.landscape.thisWeek')
              : new Intl.DateTimeFormat(this._intl.locale(), {
                  month: 'long',
                  year: 'numeric',
                }).format(group.date),
    })),
  );
  public readonly week = computed(() => {
    const date = new Date();
    date.setDate(date.getDate() + this.weekOffset() * 7);
    return date;
  });
  public readonly landscapeItems = computed<readonly ILandscapeItem[]>(() =>
    this.weekSessions().map((item) => ({
      id: item.id,
      title: item.title,
      startedAt: item.createdAt,
      durationMs: item.durationMs,
      detail: [
        item.insightCounts?.decisions
          ? this._intl.t('loc.resonanz.marker.decisionCount', item.insightCounts.decisions)
          : '',
        item.insightCounts?.forMe
          ? this._intl.t('loc.resonanz.landscape.forYouCount', item.insightCounts.forMe)
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
      waveform: this.waveforms.cache().get(item.id) ?? item.waveform ?? [],
      markers: sessionMarkers(this._details().get(item.id) ?? null),
      status: isSessionProcessing(sessionDisplayState(item))
        ? 'processing'
        : sessionDisplayState(item) === 'analysisWaiting'
          ? 'waiting'
          : needsSessionAttention(sessionDisplayState(item))
            ? 'error'
            : item.status === 'recording' || item.status === 'paused'
              ? 'recording'
              : 'ready',
      progress:
        item.pipeline?.transcription?.state === 'running'
          ? item.pipeline.transcription.progress
          : undefined,
    })),
  );
  public readonly weekSessions = computed(() => {
    const first = new Date(this.week());
    first.setHours(0, 0, 0, 0);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const last = new Date(first);
    last.setDate(last.getDate() + 7);
    return this.sessions().filter(
      (session) =>
        Date.parse(session.createdAt) >= first.getTime() &&
        Date.parse(session.createdAt) < last.getTime(),
    );
  });
  public readonly weekCaption = computed(() => {
    const first = new Date(this.week());
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const last = new Date(first);
    last.setDate(
      last.getDate() +
        (this.weekSessions().some((session) =>
          [0, 6].includes(new Date(session.createdAt).getDay()),
        )
          ? 6
          : 4),
    );
    const range = new Intl.DateTimeFormat(this._intl.locale(), {
      day: 'numeric',
      month: 'long',
    }).formatRange(first, last);
    return this._intl.t(
      'loc.resonanz.landscape.weekTotal',
      range,
      this.weekSessions().length,
      this._intl.durationLabel(
        this.weekSessions().reduce((sum, session) => sum + session.durationMs, 0),
      ),
    );
  });
  public readonly library = inject(LibraryStore);
  public readonly capture = inject(CapturePresenter);
  public readonly shell = inject(ShellPresenter);
  public readonly filterForm = form(this._filterModel);
  public readonly collectionForm = form(this._collectionModel, (schema) => {
    required(schema.name);
    maxLength(schema.name, 80);
  });
  public readonly editingCollection = signal(false);
  public readonly confirmCollectionDeletion = signal(false);
  public readonly mutating = signal(false);
  public readonly scope = computed(() => this._parameters().get('scope'));
  public readonly collection = computed(
    () =>
      this.library.collections().find((item) => item.id === this._parameters().get('collection')) ??
      null,
  );
  public readonly sessions = computed(() => {
    const query = this._filterModel().query.trim().toLocaleLowerCase(this._intl.locale());
    const collectionId = this._parameters().get('collection');
    return this.library
      .sessions()
      .filter(
        (session) =>
          (this.scope() !== 'favorites' || session.starred) &&
          (this.scope() !== 'conversations' || session.kind === 'conversation') &&
          (this.scope() !== 'moments' || (session.insightCounts?.moments ?? 0) > 0) &&
          (this.filter() !== 'today' ||
            new Date(session.createdAt).toDateString() === new Date().toDateString()) &&
          (this.filter() !== 'processing' || isSessionProcessing(sessionDisplayState(session))) &&
          (this.filter() !== 'attention' || needsSessionAttention(sessionDisplayState(session))) &&
          (this.filter() !== 'mine' || (session.insightCounts?.forMe ?? 0) > 0) &&
          (!collectionId || session.collectionId === collectionId) &&
          (!query ||
            this._matches()?.has(session.id) ||
            `${session.title} ${session.tags.join(' ')}`
              .toLocaleLowerCase(this._intl.locale())
              .includes(query)),
      )
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  private readonly _detailTargets = computed(() => {
    const selected = this.library.sessions().find((session) => session.id === this.selectedId());
    const visible =
      this.view() === 'landscape'
        ? this.weekSessions()
        : this.sessions().slice(0, LibraryPresenter._recentDetailLimit);
    return selected
      ? [selected, ...visible.filter((session) => session.id !== selected.id)]
      : visible;
  });

  public constructor() {
    effect(() => {
      const summaries = this.library.sessions();
      untracked(() => {
        if (!summaries.some((s) => s.id === this.selectedId()))
          this.selectedId.set(summaries[0]?.id ?? null);
      });
    });
    effect(() => {
      const summaries = this.library.sessions();
      const targets = this._detailTargets();
      untracked(() => this.planDetails(summaries, targets));
    });
    effect(() => {
      const query = this._filterModel().query.trim();
      const version = ++this._searchVersion;
      if (this._searchTimer) clearTimeout(this._searchTimer);
      if (!query) {
        this._matches.set(null);
        return;
      }
      this._searchTimer = setTimeout(() => {
        void this._api
          .request('sessions.search', { query })
          .then((ids) => {
            if (version === this._searchVersion) this._matches.set(new Set(ids));
          })
          .catch((error) => {
            if (version === this._searchVersion && !this._destroyed) this.library.report(error);
          });
      }, 180);
    });
    inject(DestroyRef).onDestroy(() => {
      this._destroyed = true;
      this._detailQueue.clear();
      this._detailWanted.clear();
      this._detailFailures.clear();
      this._detailRevisions.clear();
      this._plannedSummaries = [];
      this._plannedTargets = [];
      this._details.set(new Map());
      this._searchVersion++;
      if (this._searchTimer) clearTimeout(this._searchTimer);
    });
    effect(() => {
      this._parameters();
      untracked(() => {
        this.editingCollection.set(false);
        this.confirmCollectionDeletion.set(false);
        this._collectionModel.set({ name: '' });
      });
    });
  }
  public select(id: string): void {
    this.selectedId.set(id);
    this._detailFailures.delete(id);
    this.planDetails(this.library.sessions(), this._detailTargets());
  }
  public async open(id: string, tab = 'ring', edit = false): Promise<void> {
    await this._router.navigate(['/session', id], {
      queryParams: {
        tab:
          tab === 'ring' &&
          (this._details().get(id)?.pipeline?.analysis?.state === 'failed' ||
            this._details().get(id)?.pipeline?.transcription?.state === 'failed')
            ? 'processing'
            : tab,
        ...(edit ? { edit: 'true' } : {}),
      },
    });
  }
  public async openPoint(id: string, atMs: number): Promise<void> {
    await this._router.navigate(['/session', id], {
      queryParams: { tab: 'analysis', at: Math.max(0, atMs) },
    });
  }
  public async retryTranscription(id: string): Promise<void> {
    await this.perform(async () => {
      await this._transcription.transcribe(id);
      await this.library.refresh();
    });
  }
  public async deleteSelected(): Promise<void> {
    const session = this.selected();
    if (!session || !this.deleting()) return;
    await this.perform(async () => {
      await this._api.request('sessions.delete', { sessionId: session.id });
      this.deleting.set(false);
      this.selectedId.set(null);
      await this.library.refresh();
    });
  }
  public waveform(id: string): readonly number[] {
    return (
      this.waveforms.cache().get(id) ??
      this.library.sessions().find((s) => s.id === id)?.waveform ??
      []
    );
  }
  public rowMarkers(id: string) {
    return sessionMarkers(this._details().get(id) ?? null);
  }
  public readonly displayState = sessionDisplayState;
  public status(session: ISessionSummary): string {
    const state = sessionDisplayState(session);
    const progress = session.pipeline?.transcription?.progress;
    return {
      ready: this._intl.t('loc.resonanz.common.readyLabel'),
      saved: this._intl.t('loc.resonanz.capture.saved'),
      recording: this._intl.t('loc.resonanz.capture.running'),
      paused: this._intl.t('loc.resonanz.capture.paused'),
      transcribing:
        progress === undefined
          ? this._intl.t('loc.resonanz.pipeline.transcribing')
          : this._intl.t('loc.resonanz.pipeline.transcriptionPercent', this._intl.number(progress)),
      analyzing: this._intl.t('loc.resonanz.pipeline.analysisRunning'),
      analysisWaiting: this._intl.t('loc.resonanz.library.analyzeWaiting'),
      busy: this._intl.t('loc.resonanz.common.processing'),
      interrupted: this._intl.t('loc.resonanz.common.interrupted'),
      error: this._intl.t('loc.resonanz.common.failed'),
    }[state];
  }
  /** Plans only the selected session and active view, never the whole historical catalog. */
  private planDetails(
    summaries: readonly ISessionSummary[],
    targets: readonly ISessionSummary[],
  ): void {
    if (this._destroyed) return;
    this._plannedSummaries = summaries;
    this._plannedTargets = targets;
    this._detailWanted = new Map(
      targets.map((summary) => [summary.id, { summary, revision: this.detailRevision(summary) }]),
    );
    for (const [id, revision] of this._detailFailures)
      if (this._detailWanted.get(id)?.revision !== revision) this._detailFailures.delete(id);
    this._details.update((cache) => this.trimDetails(new Map(cache), summaries));
    this.rebuildDetailQueue();
    this.pumpDetails();
  }

  private refreshDetailPlan(): void {
    const summaries = this.library.sessions();
    const targets = this._detailTargets();
    if (summaries !== this._plannedSummaries || targets !== this._plannedTargets)
      this.planDetails(summaries, targets);
  }

  /** Availability/pipeline changes can retain updatedAt; waveform writes need no detail reload. */
  private detailRevision(summary: ISessionSummary): string {
    return JSON.stringify(summary, (key, value: unknown) =>
      key === 'waveform' ? undefined : value,
    );
  }

  private needsDetails(request: ILibraryDetailRequest): boolean {
    return (
      !this._details().has(request.summary.id) ||
      this._detailRevisions.get(request.summary.id) !== request.revision
    );
  }

  private rebuildDetailQueue(): void {
    this._detailQueue = new Map(
      [...this._detailWanted].filter(
        ([id, request]) =>
          !this._detailPending.has(id) &&
          this._detailFailures.get(id) !== request.revision &&
          this.needsDetails(request),
      ),
    );
  }

  private pumpDetails(): void {
    while (
      !this._destroyed &&
      this._detailPending.size < LibraryPresenter._detailConcurrency &&
      this._detailQueue.size
    ) {
      const [id, request] = this._detailQueue.entries().next().value!;
      this._detailQueue.delete(id);
      this._detailPending.set(id, request);
      void this.loadDetail(request);
    }
  }

  private async loadDetail(request: ILibraryDetailRequest): Promise<void> {
    const id = request.summary.id;
    try {
      const session = await this._api.request('sessions.get', { sessionId: id });
      if (this._destroyed) return;
      this.refreshDetailPlan();
      const current = this.library.sessions().find((summary) => summary.id === id);
      if (
        this._destroyed ||
        this._detailWanted.get(id)?.revision !== request.revision ||
        !current ||
        this.detailRevision(current) !== request.revision
      )
        return;
      if (session.id !== id) throw new Error('loc.resonanz.error.operation');
      const cached = this._details().get(id);
      if (cached && Date.parse(cached.updatedAt) > Date.parse(session.updatedAt)) {
        this._detailRevisions.set(id, request.revision);
        return;
      }
      this._detailFailures.delete(id);
      this._detailRevisions.set(id, request.revision);
      this._details.update((cache) => {
        const next = new Map(cache);
        next.delete(id);
        next.set(id, session);
        return this.trimDetails(next, this.library.sessions());
      });
      await this.waveforms.load(session);
    } catch (error) {
      if (!this._destroyed) this.refreshDetailPlan();
      if (!this._destroyed && this._detailWanted.get(id)?.revision === request.revision) {
        this._detailFailures.set(id, request.revision);
        this.library.report(error);
      }
    } finally {
      this._detailPending.delete(id);
      if (!this._destroyed) {
        const current = this._detailWanted.get(id);
        if (
          current &&
          this._detailFailures.get(id) !== current.revision &&
          this.needsDetails(current)
        )
          this.rebuildDetailQueue();
        this.pumpDetails();
      }
    }
  }

  /** Pins the whole active week/selection and keeps at most 30 other recently loaded details. */
  private trimDetails(
    cache: Map<string, ISession>,
    summaries: readonly ISessionSummary[],
  ): ReadonlyMap<string, ISession> {
    const known = new Set(summaries.map((summary) => summary.id));
    for (const id of cache.keys()) if (!known.has(id)) cache.delete(id);
    const recent = [...cache.keys()].filter((id) => !this._detailWanted.has(id));
    for (const id of recent.slice(
      0,
      Math.max(0, recent.length - LibraryPresenter._recentDetailLimit),
    ))
      cache.delete(id);
    for (const id of this._detailRevisions.keys())
      if (!cache.has(id)) this._detailRevisions.delete(id);
    return cache;
  }

  public async setTaskCompleted(taskId: string, completed: boolean): Promise<void> {
    const sessionId = this.selected()?.id;
    if (!sessionId) return;
    await this.perform(async () => {
      const session = await this._api.request('sessions.task', { sessionId, taskId, completed });
      this._details.update((cache) => new Map(cache).set(sessionId, session));
      await this.library.refresh();
    });
  }
  /** Toggles a favourite through the durable session owner. */
  public async toggleStar(session: ISessionSummary): Promise<void> {
    await this.perform(async () => {
      await this._api.request('sessions.update', {
        sessionId: session.id,
        starred: !session.starred,
      });
      await this.library.refresh();
    });
  }
  /** Opens the existing collection in a validated name editor. */
  public beginRename(): void {
    const collection = this.collection();
    if (collection) {
      this._collectionModel.set({ name: collection.name });
      this.editingCollection.set(true);
    }
  }
  /** Saves the collection name without moving its sessions. */
  public async renameCollection(): Promise<void> {
    const collection = this.collection();
    if (!collection || this.collectionForm().invalid()) return;
    await this.perform(async () => {
      await this._api.request('collections.update', {
        collectionId: collection.id,
        name: this._collectionModel().name,
      });
      await this.library.refresh();
      this.editingCollection.set(false);
    });
  }
  /** Removes a confirmed collection; its recordings remain in the library. */
  public async deleteCollection(): Promise<void> {
    const collection = this.collection();
    if (!collection || !this.confirmCollectionDeletion()) return;
    await this.perform(async () => {
      await this._api.request('collections.delete', { collectionId: collection.id });
      await this.library.refresh();
      await this._router.navigate(['/']);
    });
  }
  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.mutating()) return;
    this.mutating.set(true);
    try {
      await action();
    } catch (error) {
      this.library.report(error);
    } finally {
      this.mutating.set(false);
    }
  }
}
