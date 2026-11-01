import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { MarkerKind } from '../visualization/VisualizationModels';

/** A shape carries meaning independently of colour. */
@Component({
  selector: 'resonanz-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './MarkerComponent.html',
  styleUrl: './MarkerComponent.scss',
  host: { 'aria-hidden': 'true' },
})
export class MarkerComponent {
  public readonly kind = input<MarkerKind>('moment');
  public readonly marked = input(false);
}
