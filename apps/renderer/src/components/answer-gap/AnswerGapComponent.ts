import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { DurationPipe } from '../../pipes/DurationPipe';

/** Display data for one related passage; it contains no storage or session owner. */
export interface IAnswerGapRelated {
  readonly id: string;
  readonly title: string;
  readonly atMs: number;
  readonly selected: boolean;
}

/** An explicit evidence gap with one actionable nearby passage and a compact save action. */
@Component({
  selector: 'resonanz-answer-gap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, DurationPipe],
  templateUrl: './AnswerGapComponent.html',
  styleUrl: './AnswerGapComponent.scss',
})
export class AnswerGapComponent {
  public readonly title = input.required<string>();
  public readonly description = input.required<string>();
  public readonly relatedLabel = input.required<string>();
  public readonly related = input<IAnswerGapRelated | null>(null);
  public readonly saveLabel = input.required<string>();
  public readonly saveDisabled = input(false);
  public readonly saveTestId = input('');
  public readonly relatedSelected = output<IAnswerGapRelated>();
  public readonly saveRequested = output<void>();
}
