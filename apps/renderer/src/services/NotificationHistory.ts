// #region Imports
import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { INotificationMessage } from './INotificationMessage';
// #endregion

/**
 * A notice the window showed today, as the notification centre lists it.
 *
 * @public
 */
export interface INotificationNotice extends INotificationMessage {
  readonly id: string;
  readonly occurredAt: number;
  readonly read: boolean;
}

const MAXIMUM_NOTICES = 50;

/**
 * Keeps today's notices for the status-bar notification centre (Symphony's notification history).
 * Notices that arrive while the window is in front count as read, because their toast was seen.
 * Titles and contents stay stable message keys or original text until display.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class NotificationHistory {
  private readonly _document = inject(DOCUMENT);
  private readonly _notices = signal<readonly INotificationNotice[]>([]);
  private _sequence = 0;

  /** Today's notices, newest first. */
  public readonly notices = this._notices.asReadonly();

  /** Number of notices that arrived while the window was not in front. */
  public readonly unreadCount = computed(
    () => this._notices().filter((notice) => !notice.read).length,
  );

  /** Number of notices already seen. */
  public readonly readCount = computed(
    () => this._notices().filter((notice) => notice.read).length,
  );

  /**
   * Records a notice.
   *
   * @param notification - Notice to keep.
   * @param now - Arrival time in epoch milliseconds.
   */
  public push(notification: INotificationMessage, now = Date.now()): void {
    const notice: INotificationNotice = {
      ...notification,
      id: `notice-${++this._sequence}`,
      occurredAt: now,
      read: this.isWindowInFront(),
    };
    this._notices.update((notices) =>
      [notice, ...notices.filter((entry) => entry.occurredAt >= startOfDay(now))].slice(
        0,
        MAXIMUM_NOTICES,
      ),
    );
  }

  /** Marks every notice as read. */
  public markAllAsRead(): void {
    if (!this.unreadCount()) return;
    this._notices.update((notices) =>
      notices.map((notice) => (notice.read ? notice : { ...notice, read: true })),
    );
  }

  /** Removes notices that were already read. */
  public clearRead(): void {
    if (!this.readCount()) return;
    this._notices.update((notices) => notices.filter((notice) => !notice.read));
  }

  /**
   * Drops notices from previous days.
   *
   * @param now - Current time in epoch milliseconds.
   */
  public prune(now = Date.now()): void {
    const start = startOfDay(now);
    if (this._notices().every((notice) => notice.occurredAt >= start)) return;
    this._notices.update((notices) => notices.filter((notice) => notice.occurredAt >= start));
  }

  private isWindowInFront(): boolean {
    return this._document.visibilityState !== 'hidden' && this._document.hasFocus();
  }
}

function startOfDay(time: number): number {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}
