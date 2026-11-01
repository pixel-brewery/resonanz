import { MessagePipe } from '../pipes/MessagePipe';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { SessionPresenter } from '../presenters/SessionPresenter';
import { DurationPipe } from '../pipes/DurationPipe';
import { RadialTimelineComponent } from '../components/radial-timeline/RadialTimelineComponent';
import { MarkerLegendComponent } from '../components/marker-legend/MarkerLegendComponent';
import { MarkerComponent } from '../components/marker/MarkerComponent';
import { chapterColors, markerLabels } from '../components/visualization/VisualizationModels';
@Component({
  selector: 'resonanz-session-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MessagePipe,
    TranslatePipe,
    ButtonComponent,
    DurationPipe,
    RadialTimelineComponent,
    MarkerLegendComponent,
    MarkerComponent,
  ],
  templateUrl: './SessionRingView.html',
  styleUrl: './SessionRingView.scss',
})
export class SessionRingView {
  protected readonly intl = inject(TranslateFacade);
  protected readonly presenter = inject(SessionPresenter);
  protected readonly chapterColors = chapterColors;
  protected readonly markerLabels = markerLabels;
  protected readonly savedAnalysisProvider = computed(() => {
    switch (this.presenter.session()?.analysis?.provider) {
      case 'claude':
        return 'Claude Code';
      case 'codex':
        return 'Codex';
      case 'opencode':
        return 'OpenCode';
      default:
        return null;
    }
  });
  protected readonly focusedChapterId = computed(() => {
    const chapter = this.presenter.selectedChapter();
    if (chapter) return chapter.id;
    const marker = this.presenter.selectedMarker();
    return marker
      ? (this.presenter
          .chapters()
          .find((item) => marker.atMs >= item.startMs && marker.atMs < item.endMs)?.id ?? null)
      : null;
  });
  protected readonly chapterCounts = computed(() => {
    const details = this.presenter.selectedChapterDetails();
    if (!details) return '';
    return [
      details.decisions > 0
        ? this.intl.t(
            details.decisions === 1
              ? 'loc.resonanz.marker.decisionCountSingular'
              : 'loc.resonanz.marker.decisionCount',
            details.decisions,
          )
        : null,
      details.tasks > 0
        ? this.intl.t(
            details.tasks === 1
              ? 'loc.resonanz.marker.taskCountSingular'
              : 'loc.resonanz.marker.taskCount',
            details.tasks,
          )
        : null,
      details.questions > 0
        ? this.intl.t(
            details.questions === 1
              ? 'loc.resonanz.marker.questionCountSingular'
              : 'loc.resonanz.marker.questionCount',
            details.questions,
          )
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  });
}
