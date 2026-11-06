import { TaskRowComponent } from '../components/task-row/TaskRowComponent';
import { MessagePipe } from '../pipes/MessagePipe';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
// #region Imports
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ISessionSummary } from '@resonanz/contracts';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { ToggleButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-button';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { DurationPipe } from '../pipes/DurationPipe';
import { LibraryPresenter } from '../presenters/LibraryPresenter';
import { ResonanzGlyphComponent } from '../components/glyph/ResonanzGlyphComponent';
import { WaveformComponent } from '../components/waveform/WaveformComponent';
import { InsightStatisticsComponent } from '../components/statistics/InsightStatisticsComponent';
import { SegmentedTabsComponent } from '../components/segmented-tabs/SegmentedTabsComponent';
import { WeekLandscapeComponent } from '../components/week-landscape/WeekLandscapeComponent';
import { DeleteDialogComponent } from '../components/delete-dialog/DeleteDialogComponent';
import { TopicThreadsComponent } from '../components/topic-threads/TopicThreadsComponent';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { SplitLayoutDirective } from '../components/split-layout/SplitLayoutDirective';
import { WindowToolbarDirective } from '../components/window-toolbar/WindowToolbarDirective';
// #endregion

/** Displays real recordings, their collections and first-use capture actions. */
@Component({
  selector: 'resonanz-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LibraryPresenter],
  imports: [
    TaskRowComponent,
    MessageComponent,
    MessagePipe,
    TranslatePipe,
    TopicThreadsComponent,
    DatePipe,
    ResonanzGlyphComponent,
    WaveformComponent,
    InsightStatisticsComponent,
    SegmentedTabsComponent,
    WeekLandscapeComponent,
    DeleteDialogComponent,
    RouterLink,
    FormFieldDirective,
    ButtonComponent,
    ToggleButtonComponent,
    SearchBoxComponent,
    TextBoxComponent,
    DurationPipe,
    WindowToolbarDirective,
    SplitComponent,
    SplitLayoutDirective,
  ],
  templateUrl: './LibraryView.html',
  styleUrl: './LibraryView.scss',
})
export class LibraryView {
  protected readonly intl = inject(TranslateFacade);
  protected readonly viewTabs = [
    { id: 'landscape', label: 'loc.resonanz.library.landscape' },
    { id: 'list', label: 'loc.resonanz.library.list' },
  ];
  protected readonly filters = [
    { id: 'all', label: 'loc.resonanz.library.all' },
    { id: 'today', label: 'loc.resonanz.common.today' },
    { id: 'mine', label: 'loc.resonanz.library.myTasks' },
    { id: 'processing', label: 'loc.resonanz.capture.processing' },
    { id: 'attention', label: 'loc.resonanz.library.attention' },
  ];
  protected readonly presenter = inject(LibraryPresenter);

  /** Reconciles Mosaik's optimistic toggle when a failed write leaves the controlled input unchanged. */
  protected async toggleFavorite(
    control: ToggleButtonComponent,
    session: ISessionSummary,
  ): Promise<void> {
    const sessionId = session.id;
    await this.presenter.toggleStar(session);
    const current = this.presenter.library.sessions().find((item) => item.id === sessionId);
    const element = control.elementRef.nativeElement;
    if (element.isConnected && current) element.isChecked = current.starred;
  }
}
