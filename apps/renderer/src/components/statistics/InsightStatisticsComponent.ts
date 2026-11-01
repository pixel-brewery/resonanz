import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, input, inject } from '@angular/core';
import { MarkerComponent } from '../marker/MarkerComponent';
@Component({
  selector: 'resonanz-insight-statistics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MarkerComponent],
  templateUrl: './InsightStatisticsComponent.html',
  styleUrl: './InsightStatisticsComponent.scss',
})
export class InsightStatisticsComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly decisions = input(0);
  public readonly tasks = input(0);
  /** Optional assignment projection; omitted callers retain the total-only caption. */
  public readonly assignedTasks = input<number | null>(null);
  public readonly questions = input(0);
}
