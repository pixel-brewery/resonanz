// #region Imports
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { DurationPipe } from '../../pipes/DurationPipe';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import type { INowPlaying } from '../../services/PlaybackStore';
// #endregion

/**
 * Compact player in the status bar for whatever plays in the window: pause or resume, stop, the
 * playing session and its position. Selecting the title opens the session.
 *
 * @public
 */
@Component({
  selector: 'resonanz-mini-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, IconComponent, DurationPipe, TranslatePipe],
  templateUrl: './MiniPlayerComponent.html',
  styleUrl: './MiniPlayerComponent.scss',
})
export class MiniPlayerComponent {
  /** Current playback. */
  public readonly playback = input.required<INowPlaying>();

  /** Requests pause or resume. */
  public readonly toggled = output<void>();

  /** Requests stop. */
  public readonly stopped = output<void>();

  /** Requests opening the playing session. */
  public readonly opened = output<void>();

  protected readonly speech = computed(() => this.playback().kind === 'speech');
  protected readonly progressPercent = computed(
    () => Math.round((this.playback().progress ?? 0) * 1000) / 10,
  );
}
