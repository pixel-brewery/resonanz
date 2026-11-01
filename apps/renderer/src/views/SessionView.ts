import { SessionRecoveryView } from './SessionRecoveryView';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { DurationPipe } from '../pipes/DurationPipe';
import { SessionPresenter } from '../presenters/SessionPresenter';
import { SegmentedTabsComponent } from '../components/segmented-tabs/SegmentedTabsComponent';
import { DeleteDialogComponent } from '../components/delete-dialog/DeleteDialogComponent';
import { SessionRingView } from './SessionRingView';
import { SessionAnalysisView } from './SessionAnalysisView';
import { SessionQuestionsView } from './SessionQuestionsView';
import { WindowToolbarDirective } from '../components/window-toolbar/WindowToolbarDirective';
/** Hosts one session lifecycle across the three independently rendered feature views. */
@Component({
  selector: 'resonanz-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SessionPresenter],
  imports: [
    SessionRecoveryView,
    TranslatePipe,
    DatePipe,
    RouterLink,
    FormFieldDirective,
    ButtonComponent,
    SelectComponent,
    SelectItemComponent,
    TextBoxComponent,
    DurationPipe,
    SegmentedTabsComponent,
    DeleteDialogComponent,
    SessionRingView,
    SessionAnalysisView,
    SessionQuestionsView,
    WindowToolbarDirective,
  ],
  templateUrl: './SessionView.html',
  styleUrl: './SessionView.scss',
})
export class SessionView {
  protected readonly intl = inject(TranslateFacade);
  protected closeMenu(event: Event): void {
    const menu = (event.currentTarget as HTMLElement).parentElement;
    if (menu instanceof HTMLDetailsElement) menu.open = false;
  }
  protected readonly presenter = inject(SessionPresenter);
  protected readonly tabs = [
    { id: 'ring', label: 'loc.resonanz.session.ringTab' },
    { id: 'analysis', label: 'loc.resonanz.session.analysis' },
    { id: 'questions', label: 'loc.resonanz.question.questions' },
  ];
}
