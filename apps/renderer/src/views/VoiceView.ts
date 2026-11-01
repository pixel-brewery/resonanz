import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { ChipComponent } from '@pixel-brewery/mosaik-elements-angular/components/chip';
import { RadialTimelineComponent } from '../components/radial-timeline/RadialTimelineComponent';
import { SessionPresenter } from '../presenters/SessionPresenter';
import { VoicePresenter } from '../presenters/VoicePresenter';
import { DurationPipe } from '../pipes/DurationPipe';
@Component({
  selector: 'resonanz-voice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SessionPresenter, VoicePresenter],
  imports: [
    TranslatePipe,
    RouterLink,
    ButtonComponent,
    ChipComponent,
    RadialTimelineComponent,
    DurationPipe,
  ],
  templateUrl: './VoiceView.html',
  styleUrl: './VoiceView.scss',
})
export class VoiceView {
  protected readonly intl = inject(TranslateFacade);
  protected readonly presenter = inject(VoicePresenter);
  protected askWithKey(event: KeyboardEvent, question: string): void {
    if ((event.key === 'Enter' || event.key === ' ') && this.presenter.canAsk()) {
      event.preventDefault();
      void this.presenter.ask(this.intl.message(question));
    }
  }
}
