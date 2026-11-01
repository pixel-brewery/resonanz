import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { MessagePipe } from '../pipes/MessagePipe';
import { SilenceReminderComponent } from '../components/silence-reminder/SilenceReminderComponent';
import { ModalFocusDirective } from '../components/modal/ModalFocusDirective';
import { IntrinsicHeightDirective } from '../components/intrinsic-height/IntrinsicHeightDirective';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import { ProgressRingComponent } from '@pixel-brewery/mosaik-elements-angular/components/progress-ring';
import type { IProcessingStep, ISession } from '@resonanz/contracts';
import { DurationPipe } from '../pipes/DurationPipe';
import { ResonanzGlyphComponent } from '../components/glyph/ResonanzGlyphComponent';
import { MarkerComponent } from '../components/marker/MarkerComponent';
import { LevelMeterComponent } from '../components/level-meter/LevelMeterComponent';
import { InsightStatisticsComponent } from '../components/statistics/InsightStatisticsComponent';
import { WaveformComponent } from '../components/waveform/WaveformComponent';
import { markerLabels, type MarkerKind } from '../components/visualization/VisualizationModels';
import { CapturePresenter } from '../presenters/CapturePresenter';
import { ShellPresenter } from '../presenters/ShellPresenter';
import { DesktopApi } from '../services/DesktopApi';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
import { isMyTask } from '../presenters/sessionVisualization';
import {
  PipelineStepsComponent,
  type IPipelineItem,
} from '../components/pipeline-steps/PipelineStepsComponent';
import {
  isSessionProcessing,
  needsSessionAttention,
  sessionDisplayState,
} from '../presenters/sessionProcessing';

/** The tray's real capture controls share the existing single media owner. */
@Component({
  selector: 'resonanz-capture-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    MessagePipe,
    SilenceReminderComponent,
    ProgressRingComponent,
    PipelineStepsComponent,
    ModalFocusDirective,
    IntrinsicHeightDirective,
    FormFieldDirective,
    ButtonComponent,
    SelectComponent,
    SelectItemComponent,
    TextBoxComponent,
    ToggleSwitchComponent,
    DurationPipe,
    ResonanzGlyphComponent,
    MarkerComponent,
    LevelMeterComponent,
    InsightStatisticsComponent,
    WaveformComponent,
  ],
  templateUrl: './CapturePanelView.html',
  styleUrl: './CapturePanelView.scss',
})
export class CapturePanelView {
  protected readonly intl = inject(TranslateFacade);
  private readonly _api = inject(DesktopApi);
  private readonly _transcription = inject(NativeTranscriptionService);
  private readonly _router = inject(Router);
  private readonly _session = signal<ISession | null>(null);
  private readonly _lastId = signal<string | null>(null);
  private readonly _title = signal({ text: '' });
  private _version = 0;
  private _titleId: string | null = null;
  private _closing = false;
  private _disposed = false;
  private _resizing = false;
  private _pendingHeight: number | null = null;
  public readonly closed = output<void>();
  protected readonly capture = inject(CapturePresenter);
  protected readonly shell = inject(ShellPresenter);
  protected readonly titleForm = form(this._title);
  protected readonly session = this._session.asReadonly();
  protected readonly transcribing = computed(
    () => this._lastId() !== null && this._transcription.activeSessionId() === this._lastId(),
  );
  protected readonly markerKinds: readonly MarkerKind[] = ['decision', 'task', 'question'];
  protected readonly markerLabels = markerLabels;
  protected readonly level = computed(() =>
    this.capture.mode() === 'conversation'
      ? this.capture.live().microphoneLevel
      : this.capture.recording().microphoneLevel,
  );
  protected readonly shortcuts = /Mac/u.test(navigator.userAgent)
    ? { record: '⌥⌘R', mark: '⌥⌘M', open: '⌘O', quit: '⌘Q', voice: '⌥⌘Space' }
    : {
        record: 'Ctrl+Alt+R',
        mark: 'Ctrl+Alt+M',
        open: 'Ctrl+O',
        quit: 'Alt+F4',
        voice: 'Ctrl+Alt+Space',
      };
  protected readonly recent = computed(() =>
    this.shell.library
      .sessions()
      .slice(0, 3)
      .map((item) => {
        const state = sessionDisplayState(item);
        const progress =
          item.pipeline?.transcription?.state === 'running'
            ? item.pipeline.transcription.progress
            : item.pipeline?.analysis?.state === 'running'
              ? item.pipeline.analysis.progress
              : undefined;
        return {
          ...item,
          state,
          processing: isSessionProcessing(state),
          attention: needsSessionAttention(state),
          progress,
          detail:
            state === 'transcribing'
              ? progress === undefined
                ? this.intl.t('loc.resonanz.pipeline.transcribing')
                : this.intl.t(
                    'loc.resonanz.pipeline.transcriptionPercent',
                    this.intl.number(progress),
                  )
              : state === 'analyzing' || state === 'busy'
                ? this.intl.t('loc.resonanz.capture.analysisPending')
                : state === 'analysisWaiting'
                  ? this.intl.t(
                      'loc.resonanz.library.waitingFor',
                      item.pipeline?.analysis?.provider === 'claude'
                        ? 'Claude Code'
                        : item.pipeline?.analysis?.provider === 'codex'
                          ? 'Codex'
                          : this.shell.assistantName(),
                    )
                  : needsSessionAttention(state)
                    ? this.intl.t('loc.resonanz.library.attention')
                    : this.intl.durationLabel(item.durationMs) +
                      ' · ' +
                      this.intl.t('loc.resonanz.common.readyLabel'),
        };
      }),
  );
  protected readonly savedState = computed(() => {
    const session = this.session();
    return session ? sessionDisplayState(session) : 'saved';
  });
  protected readonly assignedTasks = computed(() => {
    const settings = this.shell.library.settings();
    return (
      this.session()?.analysis?.tasks.filter((task) =>
        isMyTask(task, settings.userName ?? '', settings.addressedAs ?? ''),
      ).length ?? 0
    );
  });
  protected readonly needsAttention = computed(() => needsSessionAttention(this.savedState()));
  protected readonly savedTitle = computed(() =>
    this.needsAttention()
      ? 'loc.resonanz.library.attention'
      : isSessionProcessing(this.savedState()) || this.transcribing() || this.capture.busy()
        ? 'loc.resonanz.common.processing'
        : this.session()?.analysis
          ? 'loc.resonanz.capture.finishedEvidence'
          : 'loc.resonanz.capture.saved',
  );
  protected readonly pipeline = computed<readonly IPipelineItem[]>(() => {
    const saved = this.session();
    if (!saved) return [];
    const transcription: IProcessingStep = saved.pipeline?.transcription ?? {
      state: this.transcribing() ? 'running' : saved.transcript.length ? 'done' : 'pending',
    };
    const analysis: IProcessingStep = saved.pipeline?.analysis ?? {
      state: saved.summary
        ? 'done'
        : saved.status === 'processing' && saved.transcript.length
          ? 'running'
          : 'pending',
    };
    return [
      {
        id: 'recording',
        label: 'loc.resonanz.capture.saved',
        state: 'done',
        detail: this.intl.t(
          'loc.resonanz.pipeline.audioDetail',
          this.intl.durationLabel(saved.durationMs),
          this.intl.number(saved.audioBytes / 1048576, 1),
        ),
      },
      {
        id: 'transcription',
        label: 'loc.resonanz.session.timestamped',
        state: transcription.state,
        retainProgress: true,
        ...(transcription.progress === undefined ? {} : { progress: transcription.progress }),
        detail: transcription.error
          ? this.intl.message(transcription.error)
          : transcription.state === 'done'
            ? this.intl.t(
                'loc.resonanz.pipeline.searchable',
                this.intl.number(
                  saved.transcript.reduce(
                    (count, segment) =>
                      count + segment.text.trim().split(/\s+/u).filter(Boolean).length,
                    0,
                  ),
                ),
              )
            : transcription.state === 'running'
              ? transcription.progress === undefined
                ? this.intl.t('loc.resonanz.pipeline.transcriptionRunning')
                : this.intl.t(
                    'loc.resonanz.pipeline.transcriptionPercent',
                    this.intl.number(transcription.progress),
                  )
              : this.intl.t('loc.resonanz.session.notCreated'),
      },
      {
        id: 'analysis',
        label: this.intl.t('loc.resonanz.capture.analysisProvider', this.shell.assistantName()),
        state: analysis.state,
        ...(analysis.progress === undefined ? {} : { progress: analysis.progress }),
        detail: analysis.error
          ? this.intl.message(analysis.error)
          : analysis.state === 'done'
            ? 'loc.resonanz.capture.analysisReady'
            : analysis.state === 'running'
              ? 'loc.resonanz.pipeline.analysisRunning'
              : 'loc.resonanz.capture.transcribeWaiting',
      },
    ];
  });
  public constructor() {
    effect(() => {
      const id = this.capture.sessionId();
      if (id) {
        this._lastId.set(id);
        void this.load(id);
      }
    });
    this.shell.library.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'session.updated' && event.sessionId === this._lastId())
        void this.load(event.sessionId);
    });
    inject(DestroyRef).onDestroy(() => {
      this._disposed = true;
      this._pendingHeight = null;
      this._version++;
    });
  }
  protected close(): void {
    this.stopSizing();
    this.closed.emit();
  }
  protected openSettings(): void {
    this.stopSizing();
    void this.shell.openSettings();
  }
  protected resizeTray(height: number): void {
    if (!this.canResize()) return;
    this._pendingHeight = height;
    void this.flushHeight();
  }
  protected async saveTitle(): Promise<void> {
    const id = this._lastId();
    const title = this._title().text.trim();
    if (!id || !title || title === this.session()?.title) return;
    try {
      this._session.set(await this._api.request('sessions.update', { sessionId: id, title }));
    } catch (error) {
      this.shell.library.report(error);
    }
  }
  protected async mark(kind: MarkerKind): Promise<void> {
    await this.capture.markMoment(kind);
    const id = this.capture.sessionId();
    if (id) await this.load(id);
  }
  protected async stop(): Promise<void> {
    await this.saveTitle();
    await this.capture.stop();
    const id = this._lastId();
    if (id) await this.load(id);
  }
  protected async open(id: string, tab = 'ring'): Promise<void> {
    this.stopSizing();
    this.shell.nativeTray.set(false);
    await this._api.request('window.show', {});
    await this._router.navigate(['/session', id], { queryParams: { tab } });
    this.closed.emit();
  }
  protected async quit(): Promise<void> {
    await this._api.request('app.quit', {});
  }
  protected reset(): void {
    this._version++;
    this._lastId.set(null);
    this._session.set(null);
    this._titleId = null;
    this._title.set({ text: '' });
  }
  private async load(id: string): Promise<void> {
    const version = ++this._version;
    try {
      const session = await this._api.request('sessions.get', { sessionId: id });
      if (version !== this._version) return;
      this._session.set(session);
      if (this._titleId !== id || !this.titleForm.text().dirty())
        this._title.set({ text: session.title });
      this._titleId = id;
    } catch (error) {
      if (version === this._version) this.shell.library.report(error);
    }
  }
  private canResize(): boolean {
    return (
      !this._closing && !this._disposed && this.shell.nativeTray() && this.shell.capturePanelOpen()
    );
  }
  private stopSizing(): void {
    this._closing = true;
    this._pendingHeight = null;
  }
  private async flushHeight(): Promise<void> {
    if (this._resizing || !this.canResize() || this._pendingHeight === null) return;
    const height = this._pendingHeight;
    this._pendingHeight = null;
    this._resizing = true;
    try {
      await this._api.request('window.tray.resize', { height });
    } catch (error) {
      if (this.canResize()) this.shell.library.report(error);
    } finally {
      this._resizing = false;
      if (this.canResize() && this._pendingHeight !== null) void this.flushHeight();
    }
  }
}
