import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslateFacade } from '../../services/TranslateFacade';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TooltipComponent } from '@pixel-brewery/mosaik-elements-angular/components/tooltip';
import { DurationPipe } from '../../pipes/DurationPipe';
import { chapterLabelLayout } from './chapterLabelLayout';
import {
  arcPath,
  chapterColors,
  polarPoint,
  timelineRatio,
  waveformBins,
  type ITimelineChapter,
  type ITimelineMarker,
  type ITimelineRange,
} from '../visualization/VisualizationModels';

interface IChapterFocusTransfer {
  readonly origin: HTMLElement;
  readonly chapterId: string | null;
  readonly source: 'bubble' | 'picker';
  readonly mode: ReturnType<typeof chapterLabelLayout>['mode'];
  readonly revision: number;
}

/** Generic circular timeline: audio, chapters, markers and a projected centre. */
@Component({
  selector: 'resonanz-radial-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MessagePipe,
    DurationPipe,
    ButtonComponent,
    SelectComponent,
    SelectItemComponent,
    TooltipComponent,
  ],
  templateUrl: './RadialTimelineComponent.html',
  styleUrl: './RadialTimelineComponent.scss',
})
export class RadialTimelineComponent {
  private readonly _element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly _side = signal(0);
  private readonly _chapterButtons = viewChildren<ButtonComponent>('chapterButton');
  private readonly _chapterPicker = viewChild<SelectComponent>('chapterPicker');
  private readonly _hoveredChapterId = signal<string | null>(null);
  private readonly _focusedChapterId = signal<string | null>(null);
  private readonly _dismissedTooltipId = signal<string | null>(null);
  private _previousLabelMode: ReturnType<typeof chapterLabelLayout>['mode'] | undefined;
  private _focusedChapterControl: Pick<
    IChapterFocusTransfer,
    'origin' | 'chapterId' | 'source'
  > | null = null;
  private _focusTransfer: IChapterFocusTransfer | null = null;
  private _focusRevision = 0;
  private _destroyed = false;
  protected readonly intl = inject(TranslateFacade);
  public readonly values = input<readonly number[]>([]);
  public readonly durationMs = input(0);
  public readonly positionMs = input(0);
  public readonly showPlayhead = input(true);
  public readonly markers = input<readonly ITimelineMarker[]>([]);
  public readonly chapters = input<readonly ITimelineChapter[]>([]);
  public readonly selectedChapterId = input<string | null>(null);
  public readonly selectedMarkerId = input<string | null>(null);
  public readonly state = input<'idle' | 'listening' | 'searching' | 'answer' | 'gap' | 'playing'>(
    'idle',
  );
  public readonly evidenceMs = input<readonly number[]>([]);
  /** Dims material without a supplied evidence position, including an explicit no-match state. */
  public readonly focusEvidence = input(false);
  public readonly waveformTone = input<'foreground' | 'subtle'>('foreground');
  public readonly playbackRange = input<ITimelineRange | null>(null);
  public readonly label = input('loc.resonanz.session.ring');
  public readonly chapterSelected = output<ITimelineChapter>();
  public readonly markerSelected = output<ITimelineMarker>();
  protected readonly focusChapter = computed(() => {
    const selected = this.chapters().find((chapter) => chapter.id === this.selectedChapterId());
    if (selected) return selected;
    const marker = this.markers().find((item) => item.id === this.selectedMarkerId());
    return marker
      ? this.chapters().find(
          (chapter) => marker.atMs >= chapter.startMs && marker.atMs < chapter.endMs,
        )
      : undefined;
  });
  protected readonly bars = computed(() =>
    waveformBins(this.values(), 180).map((value, index) => {
      const ratio = index / 180;
      const start = polarPoint(ratio, 200);
      const end = polarPoint(ratio, 210 + value * 44);
      const chapter = this.focusChapter();
      const focused = this.focusEvidence()
        ? this.evidenceMs().some((time) => Math.abs(time - ratio * this.durationMs()) < 45_000)
        : !chapter ||
          (ratio * this.durationMs() >= chapter.startMs &&
            ratio * this.durationMs() < chapter.endMs);
      return { ...start, x2: end.x, y2: end.y, focused };
    }),
  );
  protected readonly chapterArcs = computed(() =>
    this.chapters().map((chapter, index) => {
      const start = timelineRatio(chapter.startMs, this.durationMs());
      const end = timelineRatio(chapter.endMs, this.durationMs());
      const point = polarPoint((start + end) / 2, 326);
      return {
        ...chapter,
        ...point,
        path: arcPath(start + 0.0019, Math.max(start + 0.002, end - 0.0019), 295),
        color: chapter.color ?? chapterColors[index % chapterColors.length],
        selected: chapter.id === this.focusChapter()?.id,
        highlighted:
          this.focusEvidence() &&
          this.evidenceMs().some((time) => time >= chapter.startMs && time < chapter.endMs),
        faded: this.focusEvidence()
          ? !this.evidenceMs().some((time) => time >= chapter.startMs && time < chapter.endMs)
          : !!this.focusChapter() && chapter.id !== this.focusChapter()?.id,
      };
    }),
  );
  protected readonly chapterLabels = computed(() =>
    chapterLabelLayout(this.chapterArcs(), this._side(), this.ringMarkers()),
  );
  protected readonly chapterBubbles = computed(() => {
    const chapters = this.chapterArcs();
    return this.chapterLabels().bubbles.map((bubble) => ({
      ...bubble,
      chapter: chapters[bubble.index]!,
    }));
  });
  protected readonly activeTooltipId = computed(() => {
    const id = this._hoveredChapterId() ?? this._focusedChapterId();
    return id !== this._dismissedTooltipId() &&
      this.chapterBubbles().some((bubble) => bubble.id === id)
      ? id
      : null;
  });
  protected readonly pickerTooltipOpen = signal(false);
  protected readonly ringMarkers = computed(() =>
    this.markers().map((marker) => ({
      ...marker,
      ...polarPoint(timelineRatio(marker.atMs, this.durationMs()), 272),
      selected: marker.id === this.selectedMarkerId(),
      evidenced:
        this.focusEvidence() && this.evidenceMs().some((time) => Math.abs(time - marker.atMs) < 1),
      faded: this.focusEvidence()
        ? !this.evidenceMs().some((time) => Math.abs(time - marker.atMs) < 1)
        : !!this.focusChapter() &&
          (marker.atMs < this.focusChapter()!.startMs || marker.atMs >= this.focusChapter()!.endMs),
    })),
  );
  protected readonly head = computed(() =>
    polarPoint(timelineRatio(this.positionMs(), this.durationMs()), 294),
  );
  protected readonly innerHead = computed(() =>
    polarPoint(timelineRatio(this.positionMs(), this.durationMs()), 196),
  );
  protected readonly evidence = computed(() =>
    this.evidenceMs().map((time) => polarPoint(timelineRatio(time, this.durationMs()), 267)),
  );
  protected readonly clipArc = computed(() => {
    const range = this.playbackRange();
    const duration = this.durationMs();
    if (!range || !Number.isFinite(range.startMs) || !Number.isFinite(range.endMs) || duration <= 0)
      return '';
    const start = timelineRatio(range.startMs, duration);
    const end = timelineRatio(Math.min(range.endMs, this.positionMs()), duration);
    return end > start ? arcPath(start, end, 250) : '';
  });

  public constructor() {
    const destroyRef = inject(DestroyRef);
    const document = this._element.ownerDocument;
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const chapterId = this.activeTooltipId();
      if (chapterId) this._dismissedTooltipId.set(chapterId);
      if (this.pickerTooltipOpen()) this.pickerTooltipOpen.set(false);
    };
    // Hover does not move keyboard focus to the tooltip's anchor, and Select handles
    // Escape itself. Capture dismisses our overlays without consuming the control's key.
    document.addEventListener('keydown', dismissOnEscape, true);
    destroyRef.onDestroy(() => document.removeEventListener('keydown', dismissOnEscape, true));
    afterNextRender(() => {
      if (this._destroyed) return;
      const measure = (): void => {
        const bounds = this._element.getBoundingClientRect();
        this._side.set(Math.max(0, Math.min(bounds.width, bounds.height)));
      };
      const observer = new ResizeObserver(measure);
      observer.observe(this._element);
      measure();
      destroyRef.onDestroy(() => observer.disconnect());
    });
    afterRenderEffect(() => {
      const mode = this.chapterLabels().mode;
      const buttons = this._chapterButtons();
      const picker = this._chapterPicker();
      if (mode !== this._previousLabelMode) {
        this._previousLabelMode = mode;
        this._focusRevision++;
        this._focusTransfer = this.captureChapterFocus(mode);
        this.pickerTooltipOpen.set(false);
        if (mode === 'select') {
          this._hoveredChapterId.set(null);
          this._focusedChapterId.set(null);
          this._dismissedTooltipId.set(null);
        }
      }
      const transfer = this._focusTransfer;
      if (!transfer || transfer.mode !== mode) return;
      const target =
        mode === 'select'
          ? picker
          : (buttons.find(
              (button) =>
                button.elementRef.nativeElement.getAttribute('data-chapter-id') ===
                transfer.chapterId,
            ) ?? buttons[0]);
      if (target) void this.restoreChapterFocus(target, transfer);
    });
    destroyRef.onDestroy(() => {
      this._destroyed = true;
      this._focusRevision++;
      this._focusTransfer = null;
    });
  }

  protected hoverChapter(id: string | null): void {
    this._hoveredChapterId.set(id);
    if (id) this._dismissedTooltipId.set(null);
  }

  protected chapterFocusIn(event: FocusEvent, id: string | null): void {
    this._focusedChapterControl = {
      origin: event.currentTarget as HTMLElement,
      chapterId: id ?? this.focusChapter()?.id ?? this.chapters()[0]?.id ?? null,
      source: id === null ? 'picker' : 'bubble',
    };
    this._focusedChapterId.set(id);
    if (id) this._dismissedTooltipId.set(null);
  }

  protected chapterFocusOut(event: FocusEvent): void {
    this._focusedChapterId.set(null);
    // Removal can blur before or after detaching the control. Retain its focus identity
    // only for a density change; ordinary navigation must never bring focus back here.
    if (event.relatedTarget === null && this.chapterLabels().mode !== this._previousLabelMode)
      return;
    this._focusedChapterControl = null;
    this._focusTransfer = null;
  }

  protected dismissChapterTooltip(id: string): void {
    // A managed close of a previous bubble must not dismiss the newly active tooltip.
    if (this.activeTooltipId() === id) this._dismissedTooltipId.set(id);
  }

  protected selectChapterFromPicker(id: string | null): void {
    const chapter = this.chapters().find((item) => item.id === id);
    if (chapter && chapter.id !== this.focusChapter()?.id) this.chapterSelected.emit(chapter);
  }

  /** Escape can clear the native selection even when Mosaik's clear affordance is disabled. */
  protected reconcileChapterPicker(picker: SelectComponent): void {
    const element = picker.elementRef.nativeElement;
    const chapterId = this.focusChapter()?.id;
    if (element.isConnected && element.value === null && chapterId) element.value = chapterId;
  }

  protected activate(event: KeyboardEvent, action: () => void): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }
  protected selectMarker(event: KeyboardEvent, marker: ITimelineMarker): void {
    this.activate(event, () => this.markerSelected.emit(marker));
  }

  private captureChapterFocus(mode: IChapterFocusTransfer['mode']): IChapterFocusTransfer | null {
    const focused = this._focusedChapterControl;
    if (!focused || !this.canRestoreFocus(focused.origin)) return null;
    return {
      ...focused,
      chapterId:
        focused.source === 'picker'
          ? (this.focusChapter()?.id ?? focused.chapterId)
          : focused.chapterId,
      mode,
      revision: this._focusRevision,
    };
  }

  private canRestoreFocus(origin: HTMLElement): boolean {
    const document = this._element.ownerDocument;
    const active = document.activeElement;
    return (
      active === origin || (!origin.isConnected && (active === document.body || active === null))
    );
  }

  /** Restores only chapter-owned focus after the public control has rendered its native target. */
  private async restoreChapterFocus(
    target: ButtonComponent | SelectComponent,
    transfer: IChapterFocusTransfer,
  ): Promise<void> {
    const element = target.elementRef.nativeElement;
    await element.updateComplete;
    if (this._destroyed || transfer.revision !== this._focusRevision) return;
    this._focusTransfer = null;
    if (!element.isConnected || !this.canRestoreFocus(transfer.origin)) return;
    element.focus({ preventScroll: true });
  }
}
