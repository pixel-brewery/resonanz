import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { MessagePipe } from '../../pipes/MessagePipe';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { WaveformComponent } from '../waveform/WaveformComponent';
import type { ILandscapeItem, ITopicThread } from '../visualization/VisualizationModels';

/** A calendar-shaped audio landscape, driven entirely by the caller's data. */
@Component({
  selector: 'resonanz-week-landscape',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MessagePipe, DatePipe, WaveformComponent],
  templateUrl: './WeekLandscapeComponent.html',
  styleUrl: './WeekLandscapeComponent.scss',
})
export class WeekLandscapeComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly items = input<readonly ILandscapeItem[]>([]);
  public readonly week = input(new Date());
  public readonly now = input(new Date());
  public readonly selectedId = input<string | null>(null);
  public readonly threads = input<readonly ITopicThread[]>([]);
  public readonly selectedThreadId = input<string | null>(null);
  protected readonly connections = computed(() =>
    this.threads().map((thread, index) => {
      const points = thread.points.flatMap((point) => {
        const item = this.items().find((item) => item.id === point.itemId);
        if (!item) return [];
        const date = new Date(item.startedAt);
        const day = this.days().findIndex((day) => day.date.toDateString() === date.toDateString());
        if (day < 0) return [];
        const x = Math.max(
          0,
          Math.min(
            1000,
            ((date.getHours() + date.getMinutes() / 60 + point.atMs / 3600000 - 8) / 11) * 1000,
          ),
        );
        return [{ x, y: day * 88 + 38 }];
      });
      return {
        id: thread.id,
        color: thread.color,
        active: this.selectedThreadId() ? thread.id === this.selectedThreadId() : index === 0,
        points,
        path: points
          .slice(1)
          .map((point, index) => {
            const previous = points[index]!;
            const middle = (previous.y + point.y) / 2;
            return `M ${previous.x} ${previous.y} C ${previous.x} ${middle}, ${point.x} ${middle}, ${point.x} ${point.y}`;
          })
          .join(' '),
      };
    }),
  );
  public readonly itemSelected = output<ILandscapeItem>();
  protected readonly hours = Array.from({ length: 12 }, (_, i) => i + 8);
  protected readonly activeThread = computed(
    () =>
      this.threads().find((thread) => thread.id === this.selectedThreadId()) ?? this.threads()[0],
  );
  protected connected(item: ILandscapeItem): boolean {
    return this.activeThread()?.points.some((point) => point.itemId === item.id) ?? false;
  }
  protected threadColor(): string {
    return this.activeThread()?.color ?? 'var(--mosaik-scheme-foreground)';
  }
  protected barCount(item: ILandscapeItem): number {
    return Math.max(2, Math.min(36, Math.round(item.durationMs / 100000)));
  }
  protected readonly days = computed(() => {
    const first = new Date(this.week());
    first.setHours(0, 0, 0, 0);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const weekend = this.items().some((item) => {
      const date = new Date(item.startedAt);
      const end = new Date(first);
      end.setDate(end.getDate() + 7);
      return date >= first && date < end && (date.getDay() === 0 || date.getDay() === 6);
    });
    return Array.from({ length: weekend ? 7 : 5 }, (_, i) => {
      const date = new Date(first);
      date.setDate(date.getDate() + i);
      const key = date.toDateString();
      return {
        date,
        today: key === this.now().toDateString(),
        items: this.items().filter((item) => new Date(item.startedAt).toDateString() === key),
      };
    });
  });
  protected left(item: ILandscapeItem): number {
    const date = new Date(item.startedAt);
    return Math.max(0, Math.min(98, ((date.getHours() + date.getMinutes() / 60 - 8) / 11) * 100));
  }
  protected width(item: ILandscapeItem): number {
    return Math.max(0.6, Math.min(100 - this.left(item), (item.durationMs / 3_600_000 / 11) * 100));
  }
  protected labelRight(item: ILandscapeItem): boolean {
    return this.left(item) > 85;
  }
  protected labelWidth(item: ILandscapeItem): string {
    if (this.labelRight(item)) return '180px';
    const start = new Date(item.startedAt);
    const next = this.items()
      .filter(
        (candidate) =>
          new Date(candidate.startedAt).toDateString() === start.toDateString() &&
          Date.parse(candidate.startedAt) > start.getTime(),
      )
      .toSorted((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))[0];
    return next && item.durationMs > 0
      ? `calc(${((Date.parse(next.startedAt) - start.getTime()) / item.durationMs) * 100}% - 10px)`
      : '220px';
  }
  protected readonly nowPosition = computed(
    () => ((this.now().getHours() + this.now().getMinutes() / 60 - 8) / 11) * 100,
  );
  protected status(item: ILandscapeItem): string {
    return {
      ready: item.detail || 'loc.resonanz.common.readyLabel',
      processing:
        item.progress === undefined
          ? this.intl.t('loc.resonanz.common.processing')
          : this.intl.t(
              'loc.resonanz.pipeline.transcriptionPercent',
              this.intl.number(item.progress),
            ),
      waiting: 'loc.resonanz.library.analyzeWaiting',
      error: 'loc.resonanz.library.transcriptionFailed',
      recording: 'loc.resonanz.capture.running',
    }[item.status];
  }
}
