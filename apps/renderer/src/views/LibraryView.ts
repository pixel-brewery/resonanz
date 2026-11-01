import { TaskRowComponent } from '../components/task-row/TaskRowComponent';
import { MessagePipe } from '../pipes/MessagePipe';
import { TranslateFacade } from '../services/TranslateFacade';
import { TranslatePipe } from '../pipes/TranslatePipe';
// #region Imports
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormFieldDirective, TypographyDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
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
    SearchBoxComponent,
    TextBoxComponent,
    DurationPipe,
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
}
