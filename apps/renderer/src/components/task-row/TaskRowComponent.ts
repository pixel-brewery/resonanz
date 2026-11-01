import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import { CheckboxComponent } from '@pixel-brewery/mosaik-elements-angular/components/check-box';

/** A compact, controlled task row with independent completion and navigation actions. */
@Component({
  selector: 'resonanz-task-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CheckboxComponent],
  templateUrl: './TaskRowComponent.html',
  styleUrl: './TaskRowComponent.scss',
})
export class TaskRowComponent {
  private readonly _checkbox = viewChild(CheckboxComponent);
  public readonly label = input.required<string>();
  public readonly secondary = input('');
  public readonly warning = input(false);
  public readonly completed = input(false);
  public readonly disabled = input(false);
  public readonly completedChange = output<boolean>();
  public readonly selected = output<void>();

  protected change(value: boolean): void {
    // Keep the control on its acknowledged value until its owner accepts the change.
    this._checkbox()?.writeValue(this.completed());
    if (value !== this.completed() && !this.disabled()) this.completedChange.emit(value);
  }
}
