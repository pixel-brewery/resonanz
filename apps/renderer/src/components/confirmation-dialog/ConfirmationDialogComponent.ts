import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { ModalFocusDirective } from '../modal/ModalFocusDirective';

/** An explicit confirmation surface; its caller owns authorization, mutation and progress. */
@Component({
  selector: 'resonanz-confirmation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePipe, TranslatePipe, ButtonComponent, ModalFocusDirective],
  templateUrl: './ConfirmationDialogComponent.html',
  styleUrl: './ConfirmationDialogComponent.scss',
})
export class ConfirmationDialogComponent {
  private static _sequence = 0;
  protected readonly titleId = `confirmation-title-${++ConfirmationDialogComponent._sequence}`;
  protected readonly descriptionId = `${this.titleId}-description`;
  public readonly title = input.required<string>();
  public readonly description = input.required<string>();
  public readonly details = input<readonly string[]>([]);
  public readonly warning = input('');
  public readonly confirmLabel = input.required<string>();
  public readonly confirmTestId = input('confirm-destructive-action');
  public readonly blockedReason = input('');
  public readonly busy = input(false);
  public readonly confirmed = output<void>();
  public readonly cancelled = output<void>();

  protected cancel(): void {
    if (!this.busy()) this.cancelled.emit();
  }
  protected confirm(): void {
    if (!this.busy() && !this.blockedReason()) this.confirmed.emit();
  }
}
