// #region Imports
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { isTranslationKey } from '@resonanz/intl';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { TranslatePipe } from '../../pipes/TranslatePipe';
import type { INotificationNotice } from '../../services/NotificationHistory';
import { notificationIcon, notificationVariant } from '../../services/notificationAppearance';
import { TranslateFacade } from '../../services/TranslateFacade';
// #endregion

/**
 * Status-bar bell with today's notices (Symphony's notification centre). It opens upwards from
 * the status bar and closes on Escape or a click outside.
 *
 * @public
 */
@Component({
  selector: 'resonanz-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, ButtonComponent, IconComponent, DatePipe, TranslatePipe],
  host: {
    '(document:pointerdown)': 'closeOnOutside($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  templateUrl: './NotificationBellComponent.html',
  styleUrl: './NotificationBellComponent.scss',
})
export class NotificationBellComponent {
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly intl = inject(TranslateFacade);
  protected readonly icon = notificationIcon;
  protected readonly variant = notificationVariant;

  /** Today's notices, newest first. */
  public readonly notices = input<readonly INotificationNotice[]>([]);

  /** Notices that arrived while the window was in the background. */
  public readonly unreadCount = input(0);

  /** Notices already seen. */
  public readonly readCount = input(0);

  /** Requests that every notice is marked as read. */
  public readonly markedAllRead = output<void>();

  /** Requests that read notices are removed. */
  public readonly clearedRead = output<void>();

  /** Reports that the centre was opened. */
  public readonly opened = output<void>();

  /** Whether the centre is open. */
  public readonly open = signal(false);

  protected readonly label = computed(() =>
    this.unreadCount()
      ? this.intl.t('loc.resonanz.notifications.unread', this.unreadCount())
      : this.intl.t('loc.resonanz.notifications.title'),
  );

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.opened.emit();
  }

  protected text(value: string, parameters: readonly (string | number)[] = []): string {
    return isTranslationKey(value) ? this.intl.t(value, ...parameters) : value;
  }

  protected closeOnOutside(event: Event): void {
    if (!this.open()) return;
    const path = event.composedPath();
    if (!path.includes(this._host.nativeElement)) this.open.set(false);
  }
}
