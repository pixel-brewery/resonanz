import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { ProgressRingComponent } from '@pixel-brewery/mosaik-elements-angular/components/progress-ring';
import { isTranslationKey } from '@resonanz/intl';
import type { ISessionProcessingActivity } from '../../presenters/sessionProcessing';
import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { TranslateFacade } from '../../services/TranslateFacade';

/** Presents the same durable processing activity in the workspace and its status bar. */
@Component({
  selector: 'resonanz-processing-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, IconComponent, ProgressRingComponent, MessagePipe, TranslatePipe],
  templateUrl: './ProcessingStatusComponent.html',
  styleUrl: './ProcessingStatusComponent.scss',
  host: { '[class.compact]': 'compact()' },
})
export class ProcessingStatusComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly activity = input.required<ISessionProcessingActivity>();
  public readonly compact = input(false);
  public readonly opened = output<void>();
  protected readonly errorMessage = computed(() => {
    const error = this.activity().state === 'failed' ? this.activity().error : undefined;
    return error && isTranslationKey(error) ? this.intl.message(error) : null;
  });
  protected readonly openLabel = computed(() =>
    this.intl.t(
      'loc.resonanz.processing.openSession',
      this.intl.t(this.activity().label),
      this.activity().sessionTitle,
    ),
  );
}
