import { MessagePipe } from '../../pipes/MessagePipe';
import { TranslateFacade } from '../../services/TranslateFacade';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { MarkerComponent } from '../marker/MarkerComponent';
import { DurationPipe } from '../../pipes/DurationPipe';
import type { ITopicPoint, ITopicThread } from '../visualization/VisualizationModels';
/** A generic selectable thread index and its chain of original excerpts. */
@Component({
  selector: 'resonanz-topic-threads',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePipe, TranslatePipe, MarkerComponent, DurationPipe],
  templateUrl: './TopicThreadsComponent.html',
  styleUrl: './TopicThreadsComponent.scss',
})
export class TopicThreadsComponent {
  protected readonly intl = inject(TranslateFacade);
  public readonly threads = input<readonly ITopicThread[]>([]);
  public readonly selectedId = input<string | null>(null);
  public readonly description = input('loc.resonanz.landscape.tagExplain');
  public readonly threadSelected = output<string>();
  public readonly pointSelected = output<ITopicPoint>();
  protected readonly index = computed(() =>
    this.threads().map((thread) => ({
      ...thread,
      sessionCount: new Set(thread.points.map((point) => point.itemId)).size,
    })),
  );
  protected readonly selected = computed(
    () =>
      this.threads().find((thread) => thread.id === this.selectedId()) ?? this.threads()[0] ?? null,
  );
}
