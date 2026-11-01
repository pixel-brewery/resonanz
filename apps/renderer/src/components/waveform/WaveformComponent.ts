import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { DurationPipe } from '../../pipes/DurationPipe';
import { MarkerComponent } from '../marker/MarkerComponent';
import {
  timelineRatio,
  waveformBins,
  type ITimelineMarker,
} from '../visualization/VisualizationModels';

/** A linear audio fingerprint, with optional seek and marker interactions. */
@Component({
  selector: 'resonanz-waveform',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MarkerComponent, DurationPipe],
  templateUrl: './WaveformComponent.html',
  styleUrl: './WaveformComponent.scss',
})
export class WaveformComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly values = input<readonly number[]>([]);
  public readonly markers = input<readonly ITimelineMarker[]>([]);
  public readonly durationMs = input(0);
  public readonly positionMs = input(0);
  public readonly count = input(64);
  public readonly interactive = input(false);
  public readonly showTimes = input(false);
  public readonly markerPlacement = input<'inline' | 'above'>('inline');
  public readonly tone = input<'default' | 'strong' | 'danger'>('default');
  public readonly progress = input<number | null>(null);
  public readonly selectedMarkerId = input<string | null>(null);
  public readonly seek = output<number>();
  public readonly markerSelected = output<ITimelineMarker>();
  protected readonly bins = computed(() => waveformBins(this.values(), this.count()));
  protected readonly position = computed(
    () => timelineRatio(this.positionMs(), this.durationMs()) * 100,
  );
  protected ratio(atMs: number): number {
    return timelineRatio(atMs, this.durationMs()) * 100;
  }
  protected seekInput(event: Event): void {
    this.seek.emit(Number((event.target as HTMLInputElement).value));
  }
}
