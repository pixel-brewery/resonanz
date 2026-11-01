import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MessagePipe } from '../../pipes/MessagePipe';
export interface IPipelineItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly state: 'pending' | 'running' | 'done' | 'failed';
  readonly progress?: number;
  /** Keeps a completed stage's honest 100% bar visible instead of removing it. */
  readonly retainProgress?: boolean;
}
/** A processing timeline; unknown progress remains indeterminate. */
@Component({
  selector: 'resonanz-pipeline-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePipe],
  templateUrl: './PipelineStepsComponent.html',
  styleUrl: './PipelineStepsComponent.scss',
  host: { '[class.vertical]': "orientation() === 'vertical'" },
})
export class PipelineStepsComponent {
  public readonly items = input.required<readonly IPipelineItem[]>();
  public readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
}
