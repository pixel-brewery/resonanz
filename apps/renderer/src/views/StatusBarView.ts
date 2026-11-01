// #region Imports
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { ProgressRingComponent } from '@pixel-brewery/mosaik-elements-angular/components/progress-ring';
import { MiniPlayerComponent } from '../components/mini-player/MiniPlayerComponent';
import { NotificationBellComponent } from '../components/notification-bell/NotificationBellComponent';
import { DurationPipe } from '../pipes/DurationPipe';
import { TranslatePipe } from '../pipes/TranslatePipe';
import { ShellPresenter } from '../presenters/ShellPresenter';
import { NotificationHistory } from '../services/NotificationHistory';
import { PlaybackStore } from '../services/PlaybackStore';
import { TranslateFacade } from '../services/TranslateFacade';
import { UpdateStore } from '../services/UpdateStore';
// #endregion

/**
 * The window's status bar (Symphony's window status bar): the running capture, the mini player
 * for any playback, today's notifications, the version and the update control. Messages that
 * used to appear as banners above the workspace are reported here.
 *
 * @public
 */
@Component({
  selector: 'resonanz-status-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ProgressRingComponent,
    MiniPlayerComponent,
    NotificationBellComponent,
    DurationPipe,
    DecimalPipe,
    TranslatePipe,
  ],
  templateUrl: './StatusBarView.html',
  styleUrl: './StatusBarView.scss',
})
export class StatusBarView {
  protected readonly intl = inject(TranslateFacade);
  protected readonly shell = inject(ShellPresenter);
  protected readonly playback = inject(PlaybackStore);
  protected readonly updates = inject(UpdateStore);
  protected readonly notifications = inject(NotificationHistory);

  public constructor() {
    // Update notices are worded in the interface language, which the loaded settings select.
    effect(() => {
      if (!this.shell.library.loading()) untracked(() => void this.updates.initialize());
    });
  }
}
