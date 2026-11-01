import type { ITranscriptEntry } from '../components/transcript-panel/TranscriptPanelComponent';
import type { IPipelineItem } from '../components/pipeline-steps/PipelineStepsComponent';
import { TranslateFacade } from '../services/TranslateFacade';
import { transcriptEntriesWithPauses } from './transcriptEntriesWithPauses';
import { sessionDeletionDetails } from './sessionDeletionDetails';
import { DurationPipe } from '../pipes/DurationPipe';
// #region Imports
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { form, maxLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { AudioPlayer, TextToSpeechService } from '@resonanz/audio';
import type {
  AppEvent,
  ISession,
  ITranscriptSegment,
  ITranscriptEvidence,
  IInsightClaim,
  IQuestionMessage,
} from '@resonanz/contracts';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
import { CapturePresenter } from './CapturePresenter';
import { WaveformService } from '../services/WaveformService';
import {
  allClaims,
  findEvidence,
  isMyTask,
  sessionMarkers,
  transcriptMarkerIndex,
} from './sessionVisualization';
import type {
  ITimelineChapter,
  ITimelineMarker,
} from '../components/visualization/VisualizationModels';
// #endregion

export interface ISelectedChapterDetails {
  readonly ordinal: number;
  readonly decisions: number;
  readonly tasks: number;
  readonly questions: number;
}

/** Owns session editing, transcript analysis, question streams and copied audio services. */
@Injectable()
export class SessionPresenter {
  private readonly _intl = inject(TranslateFacade);
  private readonly _api = inject(DesktopApi);
  private readonly _transcriptionService = inject(NativeTranscriptionService);
  private readonly _router = inject(Router);
  private readonly _route = inject(ActivatedRoute);
  private readonly _parameters = toSignal(this._route.paramMap, {
    initialValue: this._route.snapshot.paramMap,
  });
  private readonly _query = toSignal(this._route.queryParamMap, {
    initialValue: this._route.snapshot.queryParamMap,
  });
  private readonly _waveforms = inject(WaveformService);
  private readonly _selectedMs = signal(0);
  private _excerptEndMs: number | null = null;
  private _digestTransition = false;
  private _playbackGeneration = 0;
  public readonly selectedEvidence = signal<ITranscriptEvidence | null>(null);
  public readonly selectedChapterId = signal<string | null>(null);
  public readonly selectedMarkerId = signal<string | null>(null);
  private readonly _transcriptFilter = signal({ query: '' });
  public readonly transcriptSearchForm = form(this._transcriptFilter);
  public readonly transcriptSearch = computed(() => this._transcriptFilter().query);
  public readonly transcriptMarkers = computed(() => transcriptMarkerIndex(this.session()));
  private readonly _captureMarkers = computed(() => {
    const session = this.session();
    return transcriptMarkerIndex(
      session
        ? { ...session, moments: session.moments?.filter((moment) => moment.origin !== 'note') }
        : null,
    );
  });
  public readonly myTaskCount = computed(
    () => this.session()?.analysis?.tasks.filter((task) => this.isMine(task)).length ?? 0,
  );
  public readonly assistantName = computed(() =>
    (this.session()?.analysis?.provider ?? this.library.settings().assistant.provider) === 'claude'
      ? 'Claude Code'
      : 'Codex',
  );
  public readonly context = signal<'transcript' | 'transcriptAndMoments'>('transcriptAndMoments');
  public readonly digestIndex = signal(-1);
  public readonly digestPlaying = signal(false);
  public readonly tab = computed(() => {
    const tab = this._query().get('tab');
    return tab === 'analysis' || tab === 'questions' || tab === 'processing' ? tab : 'ring';
  });
  public readonly positionMs = computed(() =>
    this.player.isPlaying() ? this.player.currentTime() * 1000 : this._selectedMs(),
  );
  public readonly waveform = computed(
    () => this._waveforms.cache().get(this.session()?.id ?? '') ?? this.session()?.waveform ?? [],
  );
  public readonly markers = computed(() => sessionMarkers(this.session()));
  public readonly chapters = computed(() => this.session()?.analysis?.chapters ?? []);
  public readonly selectedChapter = computed(
    () => this.chapters().find((chapter) => chapter.id === this.selectedChapterId()) ?? null,
  );
  public readonly selectedChapterDetails = computed<ISelectedChapterDetails | null>(() => {
    const chapter = this.selectedChapter();
    if (!chapter) return null;
    const analysis = this.session()?.analysis;
    const count = (claims: readonly IInsightClaim[]): number =>
      new Set(
        claims
          .filter((claim) =>
            claim.evidence.some(
              (evidence) => evidence.atMs >= chapter.startMs && evidence.atMs < chapter.endMs,
            ),
          )
          .map((claim) => claim.id),
      ).size;
    return {
      ordinal: this.chapters().findIndex((item) => item.id === chapter.id) + 1,
      decisions: count(analysis?.decisions ?? []),
      tasks: count(analysis?.tasks ?? []),
      questions: count(analysis?.openQuestions ?? []),
    };
  });
  public readonly selectedMarker = computed(
    () => this.markers().find((marker) => marker.id === this.selectedMarkerId()) ?? null,
  );
  public readonly selectedClaim = computed(
    () =>
      allClaims(this.session()).find((claim) =>
        claim.evidence.some((e) => e.segmentId === this.selectedEvidence()?.segmentId),
      ) ?? null,
  );
  public readonly wordCount = computed(
    () =>
      this.session()?.transcript.reduce(
        (count, s) => count + s.text.split(/\s+/u).filter(Boolean).length,
        0,
      ) ?? 0,
  );
  public readonly filteredTranscript = computed(() => {
    const query = this.transcriptSearch().toLocaleLowerCase(this._intl.locale()).trim();
    return (
      this.session()?.transcript.filter(
        (s) => !query || s.text.toLocaleLowerCase(this._intl.locale()).includes(query),
      ) ?? []
    );
  });
  public readonly transcriptContext = computed(() => {
    const transcript = this.session()?.transcript ?? [];
    const index = transcript.findIndex((s) => s.id === this.selectedEvidence()?.segmentId);
    return { before: transcript[index - 1]?.text ?? '', after: transcript[index + 1]?.text ?? '' };
  });
  public readonly transcriptEntries = computed<readonly ITranscriptEntry[]>(() =>
    transcriptEntriesWithPauses(
      this.session()?.transcript.map((segment) => {
        const marker = this.transcriptMarkers().get(segment.id);
        return {
          id: segment.id,
          text: segment.text,
          startMs: segment.startMs,
          endMs: segment.endMs,
          ...(marker ? { marker: marker.kind, marked: marker.markedByUser ?? false } : {}),
          ...(segment.speaker === 'assistant'
            ? { annotation: this._intl.t('loc.resonanz.common.ai') }
            : {}),
        };
      }) ?? [],
      this.session()?.pauses ?? [],
      (duration) =>
        duration === undefined
          ? this._intl.t('loc.resonanz.session.pauseEndUnknown')
          : this._intl.t('loc.resonanz.session.pauseDuration', this._intl.durationLabel(duration)),
    ),
  );
  public readonly transcriptMetadata = computed(() =>
    this._intl.t(
      'loc.resonanz.session.words',
      this._intl.number(this.wordCount()),
      this._intl.languageName(this.library.settings().locale),
    ),
  );
  public readonly pipelineItems = computed<readonly IPipelineItem[]>(() => {
    const session = this.session();
    const transcription = session?.pipeline?.transcription ?? {
      state: this.hasTranscript() ? ('done' as const) : ('pending' as const),
    };
    const analysis = session?.pipeline?.analysis ?? {
      state: session?.analysis || session?.summary ? ('done' as const) : ('pending' as const),
    };
    const answers =
      session?.messages.filter(
        (message) => message.role === 'assistant' && message.state === 'complete',
      ).length ?? 0;
    return [
      {
        id: 'recording',
        label: 'loc.resonanz.capture.recording',
        state: this.capturing()
          ? 'running'
          : session?.audioAvailable || session?.audioBytes
            ? 'done'
            : 'pending',
        detail:
          session?.audioAvailable || session?.audioBytes
            ? this._intl.t(
                'loc.resonanz.pipeline.audioDetail',
                this._intl.durationLabel(session?.durationMs ?? 0),
                this._intl.number((session?.audioBytes ?? 0) / 1048576, 1),
              )
            : this._intl.t('loc.resonanz.capture.localAudio'),
      },
      {
        id: 'transcription',
        label: 'loc.resonanz.session.transcript',
        state: transcription.state,
        ...(transcription.progress === undefined ? {} : { progress: transcription.progress }),
        detail: transcription.error
          ? this._intl.message(transcription.error)
          : transcription.state === 'done'
            ? this._intl.t('loc.resonanz.pipeline.searchable', this._intl.number(this.wordCount()))
            : transcription.state === 'running'
              ? this._intl.t('loc.resonanz.pipeline.transcriptionRunning')
              : this._intl.t('loc.resonanz.pipeline.noTranscript'),
      },
      {
        id: 'analysis',
        label: 'loc.resonanz.session.analysis',
        state: analysis.state,
        detail:
          analysis.state === 'done'
            ? this._intl.t('loc.resonanz.pipeline.saved')
            : analysis.state === 'running'
              ? this._intl.t('loc.resonanz.pipeline.analysisRunning')
              : this._intl.t('loc.resonanz.pipeline.analysisWaiting', this.assistantName()),
      },
      {
        id: 'questions',
        label: 'loc.resonanz.question.questions',
        state: answers ? 'done' : 'pending',
        detail: answers
          ? this._intl.t('loc.resonanz.pipeline.answerCount', answers)
          : this._intl.t('loc.resonanz.pipeline.questionsWaiting'),
      },
    ];
  });
  public readonly digestClips = computed(() => {
    const seen = new Set<string>();
    const duration = this.session()?.durationMs ?? 0;
    const analysis = this.session()?.analysis;
    return [
      ...(analysis?.decisions ?? []),
      ...(analysis?.tasks ?? []),
      ...(analysis?.openQuestions ?? []),
    ]
      .flatMap((c) => c.evidence)
      .toSorted((a, b) => a.atMs - b.atMs)
      .filter((e) => {
        if (seen.has(e.segmentId)) return false;
        seen.add(e.segmentId);
        return true;
      })
      .slice(0, 9)
      .map((e) => ({
        evidence: e,
        startMs: Math.max(0, e.atMs - 5000),
        endMs: Math.min(duration, e.atMs + 5000),
      }))
      .filter((clip) => clip.endMs > clip.startMs);
  });
  public readonly digestDurationMs = computed(() =>
    this.digestClips().reduce((sum, clip) => sum + clip.endMs - clip.startMs, 0),
  );
  private readonly _session = signal<ISession | null>(null);
  private readonly _loading = signal(true);
  private readonly _runId = signal<string | null>(null);
  private readonly _question = signal({ text: '' });
  private readonly _metadata = signal({ title: '', tags: '', collectionId: '' });
  private readonly _transcript = signal<{ segments: ITranscriptSegment[] }>({ segments: [] });
  private _loadVersion = 0;
  private _handledEditId: string | null = null;
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _speechGeneration = 0;
  private readonly _savingQuestion = signal<string | null>(null);
  private readonly _savedGapKeys = signal<ReadonlySet<string>>(new Set());
  public readonly library = inject(LibraryStore);
  public readonly capture = inject(CapturePresenter);
  public readonly player = inject(AudioPlayer);
  public readonly speech = inject(TextToSpeechService);
  public readonly session = this._session.asReadonly();
  public readonly deletionDetails = computed(() => sessionDeletionDetails(this.session()));
  public readonly loading = this._loading.asReadonly();
  public readonly pendingRunId = this._runId.asReadonly();
  public readonly savingQuestion = this._savingQuestion.asReadonly();
  public readonly stream = signal('');
  public readonly runKind = signal<'analysis' | 'question' | null>(null);
  public readonly mutating = signal(false);
  public readonly editingMetadata = signal(false);
  public readonly editingTranscript = signal(false);
  public readonly confirmDeletion = signal(false);
  public readonly questionForm = form(this._question, (schema) => {
    required(schema.text);
    maxLength(schema.text, 12_000);
  });
  public readonly metadataForm = form(this._metadata, (schema) => {
    required(schema.title);
    maxLength(schema.title, 200);
    maxLength(schema.tags, 1000);
  });
  public readonly transcriptForm = form(this._transcript);
  public readonly transcriptDraft = this._transcript.asReadonly();
  public readonly running = computed(
    () =>
      this._runId() !== null ||
      this._session()?.status === 'processing' ||
      (!!this._session()?.id &&
        this._transcriptionService.activeSessionId() === this._session()?.id),
  );
  public readonly capturing = computed(
    () => this.capture.active() && this.capture.sessionId() === this._session()?.id,
  );
  public readonly hasTranscript = computed(
    () => this._session()?.transcript.some((segment) => segment.text.trim()) ?? false,
  );
  public readonly liveHere = computed(
    () => this.capturing() && this.capture.mode() === 'conversation',
  );

  public constructor() {
    effect(() => {
      const playing = this.player.isPlaying();
      const position = this.player.currentTime() * 1000;
      if (this.digestPlaying()) {
        const clip = this.digestClips()[this.digestIndex()];
        if (clip && position >= clip.endMs && !this._digestTransition) void this.advanceDigest();
      } else if (playing && this._excerptEndMs !== null && position >= this._excerptEndMs) {
        this._excerptEndMs = null;
        this._selectedMs.set(position);
        this.player.pause();
      }
    });
    effect(() => {
      const error = this.player.error();
      if (error) untracked(() => this.library.report(new Error(error)));
    });
    effect(() => {
      const id = this._parameters().get('id');
      untracked(() => {
        this._session.set(null);
        this._playbackGeneration++;
        this.digestPlaying.set(false);
        this.digestIndex.set(-1);
        this.selectedEvidence.set(null);
        this.selectedMarkerId.set(null);
        this.selectedChapterId.set(null);
        this._selectedMs.set(0);
        this._runId.set(null);
        this.stream.set('');
        this.editingMetadata.set(false);
        this.editingTranscript.set(false);
        this.confirmDeletion.set(false);
        this._savedGapKeys.set(new Set());
        this.player.stop();
        this._loading.set(true);
        if (id) void this.load(id);
      });
    });
    this.library.events.pipe(takeUntilDestroyed()).subscribe((event) => this.receive(event));
    inject(DestroyRef).onDestroy(() => {
      this._loadVersion++;
      this._playbackGeneration++;
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this.stopSpeaking();
      this.player.stop();
    });
  }
  public async selectTab(tab: string): Promise<void> {
    await this._router.navigate([], {
      relativeTo: this._route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }
  public async selectEvidence(evidence: ITranscriptEvidence, play = false): Promise<void> {
    const current = this.selectedMarker();
    if (!current || current.atMs < evidence.atMs || current.atMs > evidence.endMs)
      this.selectedMarkerId.set(this.transcriptMarkers().get(evidence.segmentId)?.id ?? null);
    this.selectedChapterId.set(null);
    this.selectedEvidence.set(evidence);
    this._selectedMs.set(evidence.atMs);
    if (play) await this.playExcerpt(evidence);
    else if (this.player.isPlaying()) await this.seek(evidence.atMs);
  }
  public async selectMarker(marker: ITimelineMarker): Promise<void> {
    this.selectedMarkerId.set(marker.id);
    this.selectedChapterId.set(null);
    this.selectedEvidence.set(null);
    this._selectedMs.set(marker.atMs);
    const evidence = findEvidence(this.session(), marker);
    if (evidence) await this.selectEvidence(evidence);
  }
  public async selectChapter(chapter: ITimelineChapter): Promise<void> {
    this.selectedEvidence.set(null);
    this.selectedChapterId.set(chapter.id);
    this.selectedMarkerId.set(null);
    this._selectedMs.set(chapter.startMs);
    if (this.player.isPlaying()) await this.seek(chapter.startMs);
  }
  public async seek(atMs: number): Promise<void> {
    const session = this.session();
    if (!session) return;
    const value = Math.min(session.durationMs, Math.max(0, atMs));
    this._selectedMs.set(value);
    if (session.audioUrl && this.player.isPlaying())
      await this.player
        .play(undefined, { startAt: value / 1000 })
        .catch((error) => this.library.report(error));
  }
  public isMine(claim: IInsightClaim): boolean {
    return isMyTask(
      claim,
      this.library.settings().userName ?? '',
      this.library.settings().addressedAs ?? '',
    );
  }
  public isUserMarked(claim: IInsightClaim): boolean {
    return claim.evidence.some(
      (evidence) => this.transcriptMarkers().get(evidence.segmentId)?.markedByUser,
    );
  }
  public isMarkedDuringCapture(claim: IInsightClaim): boolean {
    return claim.evidence.some(
      (evidence) => this._captureMarkers().get(evidence.segmentId)?.markedByUser,
    );
  }
  public setQuestion(text: string): void {
    this._question.set({ text });
  }
  public async askSuggested(text: string): Promise<void> {
    this.setQuestion(text);
    await this.ask();
  }
  public setTranscriptSearch(query: string): void {
    this._transcriptFilter.set({ query });
  }
  public selectTranscript(entry: ITranscriptEntry): Promise<void> {
    if (entry.kind === 'pause') return Promise.resolve();
    return this.selectEvidence({
      segmentId: entry.id,
      atMs: entry.startMs,
      endMs: entry.endMs,
      quote: entry.text,
    });
  }
  public copyTranscript(): Promise<void> {
    const duration = new DurationPipe();
    return this.copy(
      this.session()
        ?.transcript.map((segment) => `[${duration.transform(segment.startMs)}] ${segment.text}`)
        .join('\n\n') ?? '',
    );
  }
  public async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      this.library.report(error);
    }
  }
  public async playExcerpt(evidence: ITranscriptEvidence): Promise<void> {
    const session = this.session();
    if (!session?.audioUrl || this.capturing()) return;
    this.digestPlaying.set(false);
    this._excerptEndMs = Math.min(
      session.durationMs,
      Math.max(evidence.endMs + 2000, evidence.atMs + 5000),
    );
    this.selectedEvidence.set(evidence);
    try {
      await this.player.play(
        this.player.sourceUrl() === session.audioUrl
          ? undefined
          : { src: session.audioUrl, label: session.title },
        { startAt: Math.max(0, evidence.atMs - 5000) / 1000 },
      );
    } catch (error) {
      this.library.report(error);
    }
  }
  public async toggleDigest(): Promise<void> {
    if (this.digestPlaying()) {
      this.digestPlaying.set(false);
      this._selectedMs.set(this.player.currentTime() * 1000);
      this.player.pause();
      return;
    }
    if (!this.session()?.audioUrl || !this.digestClips().length || this.capturing()) return;
    this._excerptEndMs = null;
    this.digestIndex.set(Math.max(0, this.digestIndex()));
    this.digestPlaying.set(true);
    await this.playDigestClip();
  }
  private async advanceDigest(): Promise<void> {
    this._digestTransition = true;
    try {
      if (this.digestIndex() + 1 >= this.digestClips().length) {
        this.digestPlaying.set(false);
        this.digestIndex.set(-1);
        this._selectedMs.set(this.player.currentTime() * 1000);
        this.selectedEvidence.set(null);
        this.selectedMarkerId.set(null);
        this.selectedChapterId.set(null);
        this.player.pause();
      } else {
        this.digestIndex.update((i) => i + 1);
        await this.playDigestClip();
      }
    } finally {
      this._digestTransition = false;
    }
  }
  private async playDigestClip(): Promise<void> {
    const session = this.session();
    const clip = this.digestClips()[this.digestIndex()];
    if (!session?.audioUrl || !clip) return;
    const claim = allClaims(session).find((item) =>
      item.evidence.some((evidence) => evidence.segmentId === clip.evidence.segmentId),
    );
    const marker = this.markers().find(
      (item) => claim && item.id === `${claim.id}:${clip.evidence.segmentId}`,
    );
    const chapter = this.chapters().find(
      (item) => item.startMs <= clip.evidence.atMs && clip.evidence.atMs < item.endMs,
    );
    this.selectedMarkerId.set(marker?.id ?? null);
    this.selectedChapterId.set(chapter?.id ?? null);
    this.selectedEvidence.set(clip.evidence);
    this._selectedMs.set(clip.startMs);
    try {
      await this.player.play(
        this.player.sourceUrl() === session.audioUrl
          ? undefined
          : { src: session.audioUrl, label: session.title },
        { startAt: clip.startMs / 1000 },
      );
    } catch (error) {
      this.digestPlaying.set(false);
      this.library.report(error);
    }
  }

  /** Reloads the active session after a committed native change. */
  public async refresh(): Promise<void> {
    const id = this._parameters().get('id');
    if (id) await this.load(id);
  }

  /** Opens a typed metadata editor without replacing live session data. */
  public beginMetadataEdit(): void {
    const session = this.session();
    if (!session) return;
    this._metadata.set({
      title: session.title,
      tags: session.tags.join(', '),
      collectionId: session.collectionId ?? '',
    });
    this.editingMetadata.set(true);
  }

  /** Saves title, tags and collection as one validated native update. */
  public async saveMetadata(): Promise<void> {
    const session = this.session();
    if (!session || this.metadataForm().invalid()) return;
    await this.perform(async () => {
      const metadata = this._metadata();
      const tags = [
        ...new Set(
          metadata.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
      await this._api.request('sessions.update', {
        sessionId: session.id,
        title: metadata.title,
        tags,
        collectionId: metadata.collectionId || null,
      });
      this.editingMetadata.set(false);
      await this.refresh();
    });
  }

  /** Toggles the current session's favourite flag. */
  public async toggleStar(): Promise<void> {
    const session = this.session();
    if (!session) return;
    await this.perform(async () => {
      await this._api.request('sessions.update', {
        sessionId: session.id,
        starred: !session.starred,
      });
      await this.refresh();
    });
  }

  /** Edits each transcript segment while preserving speaker and original time marks. */
  public beginTranscriptEdit(): void {
    const session = this.session();
    if (!session || this.capturing()) return;
    this._transcript.set({
      segments: session.transcript.length
        ? session.transcript.map((segment) => ({ ...segment }))
        : [
            {
              id: crypto.randomUUID(),
              speaker: 'participant',
              text: '',
              startMs: 0,
              endMs: session.durationMs,
              final: true,
            },
          ],
    });
    this.editingTranscript.set(true);
  }

  /** Persists corrected text while retaining segment identity and timeline. */
  public async saveTranscript(): Promise<void> {
    const session = this.session();
    if (!session) return;
    await this.perform(async () => {
      await this._api.request('transcript.replace', {
        sessionId: session.id,
        segments: this._transcript().segments,
      });
      this.editingTranscript.set(false);
      await this.refresh();
    });
  }

  /** Transcribes saved audio with native speech and bounded Windows WAV preparation. */
  public async transcribe(): Promise<void> {
    const session = this.session();
    if (!session || this.capturing()) return;
    await this.perform(async () => {
      await this._transcriptionService.transcribe(session.id);
      await this.refresh();
    });
  }

  /** Requests transcript-grounded analysis from the connected local assistant. */
  public async analyze(): Promise<void> {
    await this.startRun('analysis');
  }
  /** Cancels only the pending automatic attempt; current inference has its own cancel command. */
  public async cancelAnalysisRetry(): Promise<void> {
    const sessionId = this.session()?.id;
    if (!sessionId) return;
    await this.perform(async () => {
      await this._api.request('sessions.retry.cancel', { sessionId });
      if (this.session()?.id === sessionId) await this.refresh();
    });
  }

  /** Submits a follow-up question without losing a draft on a rejected request. */
  public async ask(): Promise<boolean> {
    if (this.questionForm().invalid()) return false;
    const text = this._question().text;
    const admitted = await this.startRun('question', text);
    if (admitted) {
      if (this._question().text === text) this._question.set({ text: '' });
    }
    return admitted;
  }

  /** Pairs only a current stored answer with its original user question. */
  public questionFor(message: IQuestionMessage): string {
    const messages = this.session()?.messages ?? [];
    const index = messages.indexOf(message);
    if (index < 0 || message.role !== 'assistant' || message.state !== 'complete') return '';
    return messages.slice(0, index).findLast((item) => item.role === 'user')?.text ?? '';
  }

  /** Returns the source question only when the stored answer explicitly reports a gap. */
  public gapQuestion(message: IQuestionMessage): string {
    return message.answer?.kind === 'gap' ? this.questionFor(message) : '';
  }

  /** User notes never turn an unanswered question into transcript evidence. */
  public gapSaved(message: IQuestionMessage): boolean {
    const session = this.session();
    const label = this.gapQuestion(message).slice(0, 500).trim();
    if (!session || !label) return false;
    return (
      this._savedGapKeys().has(`${session.id}:${label}`) ||
      !!session.moments?.some(
        (moment) =>
          moment.kind === 'question' && moment.origin === 'note' && moment.label?.trim() === label,
      )
    );
  }

  /** Persists one explicit open-question note through the session owner. */
  public async saveGap(message: IQuestionMessage): Promise<void> {
    const session = this.session();
    const label = this.gapQuestion(message).slice(0, 500).trim();
    if (!session || !label || this.capturing() || this._savingQuestion() || this.gapSaved(message))
      return;
    this._savingQuestion.set(message.id);
    try {
      await this._api.request('sessions.mark', {
        sessionId: session.id,
        moment: {
          id: crypto.randomUUID(),
          kind: 'question',
          origin: 'note',
          label,
          atMs: message.answer?.related[0]?.atMs ?? 0,
        },
      });
      if (this.session()?.id === session.id && this._parameters().get('id') === session.id) {
        this._savedGapKeys.update((keys) => new Set([...keys, `${session.id}:${label}`]));
        await this.refresh();
      }
    } catch (error) {
      this.library.report(error);
    } finally {
      this._savingQuestion.set(null);
    }
  }

  /** Cancels the correlated active assistant request. */
  public async cancelRun(): Promise<void> {
    const runId = this._runId();
    if (!runId) return;
    try {
      await this._api.request('assistant.cancel', { runId });
    } catch (error) {
      this.library.report(error);
    }
  }

  /** Uses the unchanged Flamox AudioPlayer for normal recording playback. */
  public async togglePlayback(): Promise<void> {
    const session = this.session();
    if (!session?.audioUrl || this.capturing()) return;
    this.library.clearError();
    try {
      this.digestPlaying.set(false);
      this._excerptEndMs = null;
      if (this.player.isPlaying()) {
        this._selectedMs.set(this.player.currentTime() * 1000);
        this.player.pause();
      } else
        await this.player.play(
          this.player.sourceUrl() === session.audioUrl
            ? undefined
            : { src: session.audioUrl, label: session.title },
          { startAt: this._selectedMs() / 1000 },
        );
    } catch (error) {
      this.library.report(error);
    }
  }

  /** Reads an answer through the unchanged Flamox TextToSpeechService. */
  public async speak(text: string): Promise<void> {
    const generation = ++this._speechGeneration;
    try {
      const settings = this.library.settings();
      const voice = this.library
        .capabilities()
        ?.speechVoices.find((voice) => voice.id === settings.voice);
      await this.speech.speak(text, {
        lang: settings.locale,
        rate: settings.speechRate ?? 1,
        ...(voice ? { voiceName: voice.name } : {}),
      });
    } catch (error) {
      if (generation === this._speechGeneration) this.library.report(error);
    }
  }

  /** Stops only text-to-speech, leaving recordings and the live connection alone. */
  public stopSpeaking(): void {
    this._speechGeneration++;
    this.speech.stop();
  }

  /** Exports through a native dialog; the renderer receives no arbitrary file access. */
  public async export(format: 'json' | 'markdown' | 'audio'): Promise<void> {
    const session = this.session();
    if (!session) return;
    await this.perform(async () => {
      await this._api.request('sessions.export', { sessionId: session.id, format });
    });
  }

  /** Removes the confirmed session and its media through its owning service. */
  public async delete(): Promise<void> {
    const session = this.session();
    if (!session || !this.confirmDeletion() || this.capturing()) return;
    await this.perform(async () => {
      this.player.stop();
      await this._api.request('sessions.delete', { sessionId: session.id });
      await this.library.refresh();
      await this._router.navigate(['/']);
    });
  }

  private async load(id: string): Promise<void> {
    const version = ++this._loadVersion;
    try {
      const session = await this._api.request('sessions.get', { sessionId: id });
      if (version === this._loadVersion && id === this._parameters().get('id')) {
        this._session.set(session);
        const requestedAt = this._query().get('at');
        if (requestedAt !== null && this.selectedEvidence() === null) {
          const atMs = Number(requestedAt);
          const segment = session.transcript.find(
            (segment) => Number.isFinite(atMs) && segment.startMs <= atMs && segment.endMs >= atMs,
          );
          if (segment) {
            this.selectedEvidence.set({
              segmentId: segment.id,
              atMs: segment.startMs,
              endMs: segment.endMs,
              quote: segment.text,
            });
            this._selectedMs.set(segment.startMs);
          }
        }
        void this._waveforms.load(session);
        if (this._query().get('edit') === 'true' && this._handledEditId !== session.id) {
          this._handledEditId = session.id;
          this.beginMetadataEdit();
        }
      }
    } catch (error) {
      if (version === this._loadVersion) this.library.report(error);
    } finally {
      if (version === this._loadVersion) this._loading.set(false);
    }
  }

  private async startRun(kind: 'analysis' | 'question', question?: string): Promise<boolean> {
    const session = this.session();
    if (!session || this.running() || !this.hasTranscript()) return false;
    const runId = crypto.randomUUID();
    this._runId.set(runId);
    this.runKind.set(kind);
    this.stream.set('');
    try {
      if (kind === 'analysis')
        await this._api.request('sessions.analyze', { sessionId: session.id, runId });
      else
        await this._api.request('sessions.ask', {
          sessionId: session.id,
          runId,
          question: question ?? '',
          context: this.context(),
        });
      await this.refresh();
      return true;
    } catch (error) {
      if (this._runId() === runId) this._runId.set(null);
      this.library.report(error);
      return false;
    }
  }

  private receive(event: AppEvent): void {
    if (!('sessionId' in event) || event.sessionId !== this._parameters().get('id')) return;
    if (event.type === 'assistant.text' && event.runId === this._runId())
      this.stream.update((text) => text + event.text);
    if (event.type === 'assistant.completed' || event.type === 'assistant.failed') {
      if (event.type === 'assistant.failed' && !event.cancelled)
        this.library.report(new Error(event.message));
      const ownedAnalysis = this._runId() === event.runId && this.runKind() === 'analysis';
      void this.refresh().then(() => {
        if (this._runId() === event.runId) this._runId.set(null);
        if (ownedAnalysis && event.type === 'assistant.failed' && !event.cancelled)
          void this.selectTab('processing');
        else if (
          ownedAnalysis &&
          event.type === 'assistant.completed' &&
          this.tab() === 'processing'
        )
          void this.selectTab('analysis');
      });
    }
    if (event.type === 'session.updated' && !this._refreshTimer) {
      this._refreshTimer = setTimeout(() => {
        this._refreshTimer = null;
        void this.refresh();
      }, 120);
    }
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.mutating()) return;
    this.mutating.set(true);
    this.library.clearError();
    try {
      await action();
    } catch (error) {
      this.library.report(error);
    } finally {
      this.mutating.set(false);
    }
  }
}
