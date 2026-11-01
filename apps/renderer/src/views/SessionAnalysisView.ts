import { TranscriptPanelComponent } from '../components/transcript-panel/TranscriptPanelComponent';
import { MessagePipe } from '../pipes/MessagePipe';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, afterRenderEffect, inject } from '@angular/core';
import { FormFieldDirective, TextFormatterDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { TextComponent } from '@pixel-brewery/mosaik-elements-angular/components/text';
import { SessionPresenter } from '../presenters/SessionPresenter';
import { DurationPipe } from '../pipes/DurationPipe';
import { WaveformComponent } from '../components/waveform/WaveformComponent';
import { MarkerLegendComponent } from '../components/marker-legend/MarkerLegendComponent';
import { MarkerComponent } from '../components/marker/MarkerComponent';
import { EvidenceChipComponent } from '../components/evidence-chip/EvidenceChipComponent';
@Component({
  selector: 'resonanz-session-analysis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranscriptPanelComponent,
    MessagePipe,
    TranslatePipe,
    FormFieldDirective,
    TextFormatterDirective,
    ButtonComponent,
    TextBoxComponent,
    TextComponent,
    DurationPipe,
    WaveformComponent,
    MarkerLegendComponent,
    MarkerComponent,
    EvidenceChipComponent,
  ],
  templateUrl: './SessionAnalysisView.html',
  styleUrl: './SessionAnalysisView.scss',
})
export class SessionAnalysisView {
  protected readonly intl = inject(TranslateFacade);
  protected readonly presenter = inject(SessionPresenter);
  protected readonly sections = [
    {
      key: 'decisions',
      kind: 'decision',
      label: 'loc.resonanz.marker.decisions',
      empty: 'loc.resonanz.session.noDecisions',
    },
    {
      key: 'tasks',
      kind: 'task',
      label: 'loc.resonanz.marker.tasks',
      empty: 'loc.resonanz.session.noTasks',
    },
    {
      key: 'openQuestions',
      kind: 'question',
      label: 'loc.resonanz.marker.questions',
      empty: 'loc.resonanz.session.noQuestions',
    },
  ] as const;
  public constructor() {
    afterRenderEffect(() => {
      const id = this.presenter.selectedEvidence()?.segmentId;
      if (id) document.getElementById('segment-' + id)?.scrollIntoView({ block: 'nearest' });
    });
  }
}
