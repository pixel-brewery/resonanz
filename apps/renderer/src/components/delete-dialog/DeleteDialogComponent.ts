import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { ModalFocusDirective } from '../modal/ModalFocusDirective';
import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { DurationPipe } from '../../pipes/DurationPipe';
import type { IDeleteSessionDetails } from './IDeleteSessionDetails';
@Component({
  selector: 'resonanz-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ModalFocusDirective, ButtonComponent, IconComponent, DurationPipe],
  templateUrl: './DeleteDialogComponent.html',
  styleUrl: './DeleteDialogComponent.scss',
})
export class DeleteDialogComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly title = input.required<string>();
  public readonly durationMs = input(0);
  public readonly audioBytes = input(0);
  public readonly audioAvailable = input(false);
  public readonly details = input<IDeleteSessionDetails | null>(null);
  public readonly busy = input(false);
  public readonly confirmed = output<void>();
  public readonly cancelled = output<void>();
  protected readonly transcriptDetails = computed(() => {
    const details = this.details();
    if (!details) return this.intl.t('loc.resonanz.delete.detailsUnknown');
    const count = this.intl.number(details.wordCount);
    switch (details.transcriptState) {
      case 'empty':
        return this.intl.t('loc.resonanz.delete.none');
      case 'partial':
        return this.intl.t('loc.resonanz.delete.transcriptPartial', count);
      case 'ready':
        return this.intl.t('loc.resonanz.delete.transcriptComplete', count);
      default:
        return this.intl.t('loc.resonanz.delete.transcriptUnknown', count);
    }
  });
  protected readonly analysisDetails = computed(() => {
    const details = this.details();
    if (!details) return this.intl.t('loc.resonanz.delete.detailsUnknown');
    if (!details.analysisAvailable && !details.questionCount && !details.markerCount)
      return this.intl.t('loc.resonanz.delete.none');
    return this.intl.t(
      details.analysisAvailable
        ? 'loc.resonanz.delete.withAnalysis'
        : 'loc.resonanz.delete.withoutAnalysis',
      this.intl.number(details.questionCount),
      this.intl.number(details.markerCount),
    );
  });
}
