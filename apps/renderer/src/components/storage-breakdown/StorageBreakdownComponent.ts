import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  SegmentBarComponent,
  SegmentBarItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/segment-bar';
import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslateFacade } from '../../services/TranslateFacade';
import type { IStorageSegment } from './IStorageSegment';

/** Displays measured logical bytes in decimal SI units; callers own measurement and refresh. */
@Component({
  selector: 'resonanz-storage-breakdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePipe, SegmentBarComponent, SegmentBarItemComponent],
  templateUrl: './StorageBreakdownComponent.html',
  styleUrl: './StorageBreakdownComponent.scss',
})
export class StorageBreakdownComponent {
  private readonly _intl = inject(TranslateFacade);
  public readonly label = input.required<string>();
  public readonly segments = input.required<readonly IStorageSegment[]>();
  public readonly totalBytes = input.required<number>();
  public readonly busy = input(false);
  public readonly busyLabel = input('');
  protected readonly formattedTotal = computed(() => this.formatBytes(this.totalBytes()));
  protected readonly rows = computed(() =>
    this.segments().map((segment) => ({ ...segment, formatted: this.formatBytes(segment.bytes) })),
  );

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const amount = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
    const unit = amount > 0 ? Math.min(units.length - 1, Math.floor(Math.log10(amount) / 3)) : 0;
    return `${new Intl.NumberFormat(this._intl.locale(), { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(amount / 1000 ** unit)} ${units[unit]}`;
  }
}
