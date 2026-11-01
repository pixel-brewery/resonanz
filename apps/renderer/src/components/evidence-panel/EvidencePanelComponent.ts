import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { DurationPipe } from '../../pipes/DurationPipe';
import { MarkerComponent } from '../marker/MarkerComponent';
import { markerLabels, type MarkerKind } from '../visualization/VisualizationModels';
@Component({
  selector: 'resonanz-evidence-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePipe, TranslatePipe, ButtonComponent, DurationPipe, MarkerComponent],
  templateUrl: './EvidencePanelComponent.html',
  styleUrl: './EvidencePanelComponent.scss',
})
export class EvidencePanelComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly quote = input.required<string>();
  public readonly before = input('');
  public readonly after = input('');
  public readonly atMs = input(0);
  public readonly durationMs = input(0);
  public readonly kind = input<MarkerKind>('moment');
  public readonly label = input('');
  protected readonly heading = computed(
    () =>
      this.label() ||
      (this.kind() === 'moment' ? 'loc.resonanz.question.evidence' : markerLabels[this.kind()]),
  );
  public readonly audioAvailable = input(false);
  public readonly play = output<void>();
  public readonly transcript = output<void>();
}
