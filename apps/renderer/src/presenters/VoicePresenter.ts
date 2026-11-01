import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ITranscriptEvidence } from '@resonanz/contracts';
import { DesktopApi } from '../services/DesktopApi';
import { TranslateFacade } from '../services/TranslateFacade';
import { SessionPresenter } from './SessionPresenter';
import { CapturePresenter } from './CapturePresenter';
import { AudioCaptureLease } from '../audio/AudioCaptureLease';
import type { ITimelineRange } from '../components/visualization/VisualizationModels';

interface IQuestionDictation {
  readonly request: { readonly sessionId: string; readonly operationId: string };
  readonly owner: symbol;
}

const suggestionKeys = [
  'loc.resonanz.question.releaseDate',
  'loc.resonanz.question.myTasks',
  'loc.resonanz.question.open',
  'loc.resonanz.question.pressRelease',
] as const;

/** Session-scoped dictation uses native recognition without editing the source transcript. */
@Injectable()
export class VoicePresenter {
  private readonly _api = inject(DesktopApi);
  private readonly _intl = inject(TranslateFacade);
  private readonly _lease = inject(AudioCaptureLease);
  private _operation: IQuestionDictation | null = null;
  private _startingOperation: IQuestionDictation | null = null;
  private _voiceGeneration = 0;
  private _destroyed = false;
  private _speakAfterRun: string | null = null;
  private readonly _closingCount = signal(0);
  private readonly _answerRunId = signal<string | null>(null);
  private readonly _askedTexts = signal<readonly string[]>([]);
  public readonly session = inject(SessionPresenter);
  public readonly capture = inject(CapturePresenter);
  public readonly listening = signal(false);
  public readonly starting = signal(false);
  public readonly draft = signal('');
  public readonly noteSaved = signal(false);
  public readonly noteSaving = signal(false);
  public readonly originalRange = signal<ITimelineRange | null>(null);
  public readonly stopping = computed(() => this._closingCount() > 0);
  public readonly liveHere = computed(() => this.session.liveHere());
  public readonly assistantName = computed(() =>
    this.session.library.settings().assistant.provider === 'claude' ? 'Claude Code' : 'Codex',
  );
  public readonly lastAnswer = computed(() => {
    const messages = this.session.session()?.messages ?? [];
    return (
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === 'assistant' &&
            message.state === 'complete' &&
            (this.liveHere() || (!!this._answerRunId() && message.runId === this._answerRunId())),
        ) ?? null
    );
  });
  public readonly question = computed(() =>
    this.liveHere() ? this.capture.live().participantDraft : this.draft(),
  );
  public readonly answer = computed(() =>
    this.liveHere() ? this.capture.live().assistantDraft : (this.lastAnswer()?.text ?? ''),
  );
  public readonly evidence = computed<readonly ITranscriptEvidence[]>(() => {
    const answer = this.lastAnswer()?.answer;
    if (!answer || answer.kind === 'gap') return [];
    const seen = new Set<string>();
    return answer.claims
      .flatMap((claim) => claim.evidence)
      .filter((item) => {
        if (seen.has(item.segmentId)) return false;
        seen.add(item.segmentId);
        return true;
      });
  });
  public readonly evidenceMs = computed(() => this.evidence().map((item) => item.atMs));
  public readonly voiceChapters = computed(() => {
    const palette = [
      'var(--mosaik-color-info-500)',
      'var(--mosaik-color-secondary-500)',
      'var(--mosaik-color-info-500)',
      'var(--mosaik-color-tertiary-500)',
      'var(--mosaik-color-highlight-500)',
      'var(--mosaik-color-warning-500)',
    ] as const;
    return this.session.chapters().map((chapter, index) => ({
      ...chapter,
      color: palette[index % palette.length] ?? palette[0],
    }));
  });
  public readonly activeEvidence = computed(
    () =>
      this.evidence().find(
        (item) => item.segmentId === this.session.selectedEvidence()?.segmentId,
      ) ??
      this.evidence()[0] ??
      null,
  );
  public readonly state = computed<
    'idle' | 'listening' | 'searching' | 'answer' | 'gap' | 'playing'
  >(() => {
    if (this.liveHere())
      return this.capture.live().stage === 'thinking'
        ? 'searching'
        : this.capture.live().stage === 'speaking'
          ? 'answer'
          : this.capture.state() === 'paused'
            ? 'idle'
            : 'listening';
    if (this.listening() || this.starting()) return 'listening';
    if (this.stopping()) return 'searching';
    if (this.session.pendingRunId()) return 'searching';
    if (this.session.playingHere() && this.originalRange()) return 'playing';
    return this.lastAnswer()
      ? this.lastAnswer()?.answer?.kind === 'gap'
        ? 'gap'
        : 'answer'
      : 'idle';
  });
  public readonly interruptible = computed(
    () => this.state() === 'listening' || this.state() === 'searching',
  );
  public readonly canAsk = computed(
    () =>
      this.session.hasTranscript() &&
      !this.liveHere() &&
      !this.capture.active() &&
      !this.session.running() &&
      !this.listening() &&
      !this.starting() &&
      !this.stopping(),
  );
  public readonly canPlayOriginal = computed(
    () =>
      !!this.activeEvidence() &&
      !!this.session.session()?.audioAvailable &&
      !this.capture.active() &&
      !this.interruptible(),
  );
  public readonly suggestions = computed(() =>
    suggestionKeys
      .filter(
        (key) =>
          !this._askedTexts().includes(this._intl.message(key)) &&
          this.question() !== this._intl.message(key),
      )
      .slice(0, 3),
  );
  public readonly durationLabel = computed(() => {
    const durationMs = this.session.session()?.durationMs ?? 0;
    return durationMs >= 60_000
      ? this._intl.t('loc.resonanz.voice.fullMinutes', Math.floor(durationMs / 60_000))
      : this._intl.durationLabel(durationMs);
  });
  public readonly recognitionName = computed(() => {
    const platform = this.session.library.capabilities()?.platform;
    return this._intl.t(
      platform === 'darwin'
        ? 'loc.resonanz.voice.recognitionMac'
        : platform === 'win32'
          ? 'loc.resonanz.voice.recognitionWindows'
          : 'loc.resonanz.voice.nativeRecognition',
    );
  });
  public readonly headerMetadata = computed(() =>
    this._intl.t(
      'loc.resonanz.voice.headerContext',
      this.durationLabel(),
      this._intl.t('loc.resonanz.session.chapterCount', this.session.chapters().length),
      this.assistantName(),
      this.recognitionName(),
    ),
  );
  public readonly statusLabel = computed(() => {
    switch (this.state()) {
      case 'listening':
        return this._intl.t('loc.resonanz.voice.listen');
      case 'searching':
        return this.liveHere()
          ? this._intl.t('loc.resonanz.question.thinking')
          : this._intl.t('loc.resonanz.voice.searchDuration', this.durationLabel());
      case 'gap':
        return this._intl.t('loc.resonanz.session.noPassage');
      case 'answer':
      case 'playing':
        return this.liveHere()
          ? this._intl.t('loc.resonanz.voice.answering')
          : this._intl.t('loc.resonanz.question.foundCount', this.evidence().length);
      default:
        return this._intl.t(
          this.session.session()
            ? 'loc.resonanz.question.title'
            : 'loc.resonanz.settings.assistantLocal',
        );
    }
  });
  public readonly shortcut = computed(() =>
    this.session.library.capabilities()?.platform === 'darwin' ? '⌥⌘Space' : 'Ctrl+Alt+Space',
  );

  public constructor() {
    this.session.library.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'ui.command' && event.command === 'voice.open') {
        void this.microphone();
        return;
      }
      const operation = this._operation;
      if (!operation || !('sessionId' in event) || event.sessionId !== operation.request.sessionId)
        return;
      if (event.type === 'speech.result' && event.operationId === operation.request.operationId) {
        this.draft.set(event.text);
        if (event.final && event.text.trim()) {
          const generation = this._voiceGeneration;
          this._operation = null;
          this.listening.set(false);
          void this.closeNative(operation).then((stopped) => {
            if (stopped && !this._destroyed && generation === this._voiceGeneration)
              return this.ask(event.text);
            return undefined;
          });
        }
      }
      if (event.type === 'speech.error') {
        void this.stopDictation();
        this.session.library.report(new Error(event.message));
      }
    });
    effect(() => {
      const answer = this.lastAnswer();
      const pending = this.session.pendingRunId();
      if (this._speakAfterRun && answer?.runId === this._speakAfterRun && !pending) {
        this._speakAfterRun = null;
        const evidence = this.evidence()[0];
        if (evidence) void this.session.selectEvidence(evidence);
        void this.session.speak(answer.text);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this._destroyed = true;
      this._speakAfterRun = null;
      void this.stopDictation();
    });
  }

  /** Toggles only the currently mounted voice operation or the existing live conversation. */
  public async microphone(): Promise<void> {
    if (this._destroyed) return;
    if (this.stopping()) {
      this._voiceGeneration++;
      this._speakAfterRun = null;
      return;
    }
    if (this.liveHere()) {
      if (this.capture.state() === 'paused') await this.capture.resume();
      else if (this.capture.live().stage === 'speaking' || this.capture.live().stage === 'thinking')
        await this.capture.interrupt();
      else await this.capture.pause();
      return;
    }
    if (this.listening() || this.starting() || this.session.pendingRunId()) {
      this._speakAfterRun = null;
      await this.stopDictation();
      await this.session.cancelRun();
      this.session.stopSpeaking();
      return;
    }
    const session = this.session.session();
    if (!session) {
      await this.capture.startLive();
      return;
    }
    if (this.capture.active()) {
      this.session.library.report(new Error('loc.resonanz.error.captureBeforeQuestion'));
      return;
    }
    if (!this.session.library.capabilities()?.nativeConversation) {
      this.session.library.report(new Error('loc.resonanz.error.nativeRecognition'));
      return;
    }
    this.session.stopSpeaking();
    this.session.player.pause();
    this.originalRange.set(null);
    this.draft.set('');
    this.noteSaved.set(false);
    const operation: IQuestionDictation = {
      request: { sessionId: session.id, operationId: crypto.randomUUID() },
      owner: Symbol('session-question'),
    };
    try {
      this._lease.acquire(operation.owner);
    } catch (error) {
      this.session.library.report(error);
      return;
    }
    const generation = ++this._voiceGeneration;
    this._operation = operation;
    this._startingOperation = operation;
    this.starting.set(true);
    try {
      await this._api.request('dictation.start', operation.request);
      if (!this._destroyed && generation === this._voiceGeneration && this._operation === operation)
        this.listening.set(true);
      else await this.closeNative(operation);
    } catch (error) {
      if (generation === this._voiceGeneration) {
        this._operation = null;
        this.session.library.report(error);
      }
      await this.closeNative(operation);
    } finally {
      if (this._startingOperation === operation) {
        this._startingOperation = null;
        this.starting.set(false);
      }
    }
  }

  /** Submits an explicit question and reads only the answer correlated with this turn. */
  public async ask(text: string): Promise<void> {
    if (
      this._destroyed ||
      !text.trim() ||
      !this.session.hasTranscript() ||
      this.capture.active() ||
      this.session.running() ||
      this.liveHere() ||
      this.listening() ||
      this.stopping()
    )
      return;
    this.session.stopSpeaking();
    this.session.player.pause();
    this.originalRange.set(null);
    this.draft.set(text);
    this.noteSaved.set(false);
    const pending = this.session.askSuggested(text);
    const runId = this.session.pendingRunId();
    this._speakAfterRun = runId;
    this._answerRunId.set(runId);
    if (runId && suggestionKeys.some((key) => this._intl.message(key) === text))
      this._askedTexts.update((values) =>
        values.includes(text) ? values : [...values, text].slice(-4),
      );
    await pending;
    if (!this.session.pendingRunId() && !this.lastAnswer()) this._speakAfterRun = null;
  }

  /** Plays the selected validated evidence with progress supplied by the existing player. */
  public async playOriginal(): Promise<void> {
    if (!this.canPlayOriginal()) return;
    if (this.session.playingHere() && this.originalRange()) {
      await this.session.togglePlayback();
      return;
    }
    const evidence = this.activeEvidence();
    if (!evidence) return;
    this.session.stopSpeaking();
    this.originalRange.set({
      startMs: Math.max(0, evidence.atMs - 5000),
      endMs: Math.min(
        this.session.session()?.durationMs ?? 0,
        Math.max(evidence.endMs + 2000, evidence.atMs + 5000),
      ),
    });
    await this.session.playExcerpt(evidence);
  }

  /** Stores a user note, never a fabricated transcript reference, and coalesces repeated clicks. */
  public async saveNote(): Promise<void> {
    const session = this.session.session();
    const answer = this.lastAnswer();
    if (!session || !answer || this.noteSaving() || this.noteSaved()) return;
    this.noteSaving.set(true);
    const gap = answer.answer?.kind === 'gap';
    try {
      await this._api.request('sessions.mark', {
        sessionId: session.id,
        moment: {
          id: crypto.randomUUID(),
          kind: gap ? 'question' : 'moment',
          origin: 'note',
          atMs: this.evidenceMs()[0] ?? answer.answer?.related[0]?.atMs ?? 0,
          label: (gap ? this.question() : answer.text).slice(0, 500),
        },
      });
      this.noteSaved.set(true);
      await this.session.refresh();
    } catch (error) {
      this.session.library.report(error);
    } finally {
      this.noteSaving.set(false);
    }
  }

  private async closeNative(operation: IQuestionDictation): Promise<boolean> {
    this._closingCount.update((count) => count + 1);
    try {
      await this._api.request('dictation.stop', operation.request);
      return true;
    } catch (error) {
      this.session.library.report(error);
      return false;
    } finally {
      this._lease.release(operation.owner);
      this._closingCount.update((count) => count - 1);
    }
  }

  private async stopDictation(): Promise<void> {
    this._voiceGeneration++;
    this.listening.set(false);
    const operation = this._operation;
    this._operation = null;
    if (operation) await this.closeNative(operation);
  }
}
