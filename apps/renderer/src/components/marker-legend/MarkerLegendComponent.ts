import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, input, inject } from '@angular/core';
import { MarkerComponent } from '../marker/MarkerComponent';
@Component({
  selector: 'resonanz-marker-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MarkerComponent],
  templateUrl: './MarkerLegendComponent.html',
  styleUrl: './MarkerLegendComponent.scss',
})
export class MarkerLegendComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly includeUser = input(false);
  public readonly circular = input(false);
}
