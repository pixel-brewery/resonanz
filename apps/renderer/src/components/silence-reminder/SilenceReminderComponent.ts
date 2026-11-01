import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';

/** A reusable continuation choice. It never stops capture or owns a clock. */
@Component({
  selector: 'resonanz-silence-reminder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './SilenceReminderComponent.html',
  styleUrl: './SilenceReminderComponent.scss',
})
export class SilenceReminderComponent {
  public readonly title = input.required<string>();
  public readonly description = input.required<string>();
  public readonly continueLabel = input.required<string>();
  public readonly stopLabel = input.required<string>();
  public readonly busy = input(false);
  public readonly continued = output<void>();
  public readonly stopped = output<void>();
}
