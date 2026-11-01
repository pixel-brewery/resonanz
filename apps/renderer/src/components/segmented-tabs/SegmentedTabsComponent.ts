import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslateFacade } from '../../services/TranslateFacade';
import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
export interface ISegmentedTab {
  readonly id: string;
  readonly label: string;
}
/** A compact view switch, with roving keyboard focus. */
@Component({
  imports: [MessagePipe],
  selector: 'resonanz-segmented-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './SegmentedTabsComponent.html',
  styleUrl: './SegmentedTabsComponent.scss',
})
export class SegmentedTabsComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly tabs = input.required<readonly ISegmentedTab[]>();
  public readonly value = input.required<string>();
  public readonly label = input('loc.resonanz.common.view');
  public readonly valueChange = output<string>();
  protected key(event: KeyboardEvent, index: number): void {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? this.tabs().length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + this.tabs().length) %
            this.tabs().length;
    this.valueChange.emit(this.tabs()[next]!.id);
    const parent = (event.currentTarget as HTMLElement).parentElement;
    (parent?.children[next] as HTMLElement | undefined)?.focus();
  }
}
