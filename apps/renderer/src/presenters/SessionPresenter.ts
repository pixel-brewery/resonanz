// #region Imports
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { form, maxLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { AudioPlayer, TextToSpeechService } from '@resonanz/audio';
import type { AppEvent, ISession, ITranscriptSegment } from '@resonanz/contracts';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
import { CapturePresenter } from './CapturePresenter';
// #endregion

/** Owns session editing, transcript analysis, question streams and copied audio services. */
@Injectable()
export class SessionPresenter {
  private readonly _api = inject(DesktopApi);
  private readonly _transcriptionService = inject(NativeTranscriptionService);
  private readonly _router = inject(Router);
  private readonly _route = inject(ActivatedRoute);
  private readonly _parameters = toSignal(this._route.paramMap, {
    initialValue: this._route.snapshot.paramMap,
  });
  private readonly _session = signal<ISession | null>(null);
  private readonly _loading = signal(true);
  private readonly _runId = signal<string | null>(null);
  private readonly _question = signal({ text: '' });
  private readonly _metadata = signal({ title: '', tags: '', collectionId: '' });
  private readonly _transcript = signal<{ segments: ITranscriptSegment[] }>({ segments: [] });
  private _loadVersion = 0;
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _speechGeneration = 0;
  public readonly library = inject(LibraryStore);
  public readonly capture = inject(CapturePresenter);
  public readonly player = inject(AudioPlayer);
  public readonly speech = inject(TextToSpeechService);
  public readonly session = this._session.asReadonly();
  public readonly loading = this._loading.asReadonly();
  public readonly pendingRunId = this._runId.asReadonly();
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
    () => this._runId() !== null || this._session()?.status === 'processing',
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
      const error = this.player.error();
      if (error) untracked(() => this.library.report(new Error(error)));
    });
    effect(() => {
      const id = this._parameters().get('id');
      untracked(() => {
        this._session.set(null);
        this._runId.set(null);
        this.stream.set('');
        this.editingMetadata.set(false);
        this.editingTranscript.set(false);
        this.confirmDeletion.set(false);
        this.player.stop();
        this._loading.set(true);
        if (id) void this.load(id);
      });
    });
    this.library.events.pipe(takeUntilDestroyed()).subscribe((event) => this.receive(event));
    inject(DestroyRef).onDestroy(() => {
      this._loadVersion++;
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this.stopSpeaking();
      this.player.stop();
    });
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

  /** Submits a follow-up question without losing a draft on a rejected request. */
  public async ask(): Promise<void> {
    if (this.questionForm().invalid()) return;
    const text = this._question().text;
    if (await this.startRun('question', text)) {
      if (this._question().text === text) this._question.set({ text: '' });
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
      if (this.player.isPlaying()) this.player.pause();
      else
        await this.player.play(
          this.player.sourceUrl() === session.audioUrl
            ? undefined
            : { src: session.audioUrl, label: session.title },
        );
    } catch (error) {
      this.library.report(error);
    }
  }

  /** Reads an answer through the unchanged Flamox TextToSpeechService. */
  public async speak(text: string): Promise<void> {
    const generation = ++this._speechGeneration;
    try {
      await this.speech.speak(text, { lang: this.library.settings().locale });
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
      if (version === this._loadVersion && id === this._parameters().get('id'))
        this._session.set(session);
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
      void this.refresh().then(() => {
        if (this._runId() === event.runId) this._runId.set(null);
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
