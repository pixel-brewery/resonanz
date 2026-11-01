import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslateFacade } from '../../services/TranslateFacade';
import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { DurationPipe } from '../../pipes/DurationPipe';
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

/** Generic circular timeline: audio, chapters, markers and a projected centre. */
@Component({
  selector: 'resonanz-radial-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePipe, DurationPipe],
  templateUrl: './RadialTimelineComponent.html',
  styleUrl: './RadialTimelineComponent.scss',
})
export class RadialTimelineComponent {
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
  protected activate(event: KeyboardEvent, action: () => void): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }
  protected selectChapter(event: KeyboardEvent, chapter: ITimelineChapter): void {
    this.activate(event, () => this.chapterSelected.emit(chapter));
  }
  protected selectMarker(event: KeyboardEvent, marker: ITimelineMarker): void {
    this.activate(event, () => this.markerSelected.emit(marker));
  }
}
