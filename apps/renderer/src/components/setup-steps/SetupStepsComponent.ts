import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import type { ISetupStep } from './ISetupStep';

/** Renders a numbered setup rail; workflow state and transitions remain with its caller. */
@Component({
  selector: 'resonanz-setup-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePipe, TranslatePipe],
  templateUrl: './SetupStepsComponent.html',
  styleUrl: './SetupStepsComponent.scss',
})
export class SetupStepsComponent {
  public readonly steps = input.required<readonly ISetupStep[]>();
  public readonly activeIndex = input(0);
  public readonly availableThrough = input(0);
  public readonly disabled = input(false);
  public readonly selected = output<number>();
}
