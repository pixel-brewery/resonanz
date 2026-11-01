import { TranslateFacade } from '../../services/TranslateFacade';
import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
import { DurationPipe } from '../../pipes/DurationPipe';
@Component({
  selector: 'resonanz-evidence-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DurationPipe],
  templateUrl: './EvidenceChipComponent.html',
  styleUrl: './EvidenceChipComponent.scss',
})
export class EvidenceChipComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly atMs = input.required<number>();
  public readonly selected = input(false);
  public readonly marked = input(false);
  public readonly selectedChange = output<void>();
}
