// #region Imports
import { Injectable, inject } from '@angular/core';
import { isTranslationKey } from '@resonanz/intl';
import type { INotificationAction, INotificationMessage } from './INotificationMessage';
import { NotificationHistory } from './NotificationHistory';
import { NOTIFICATION_TOASTS } from './NotificationToasts';
// #endregion

/**
 * Shows application notices at the bottom of the window, as Symphony does: a short toast at the
 * bottom left and an entry in the status-bar notification centre. It replaces banners above the
 * workspace. Titles and contents stay stable message keys or original text until display.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _history = inject(NotificationHistory);
  private readonly _toasts = inject(NOTIFICATION_TOASTS, { optional: true });
  private readonly _shownOnce = new Set<string>();

  /** Shows neutral information. */
  public showInfo(title: string, content = '', action?: INotificationAction): void {
    this.push({ kind: 'info', title, content }, action);
  }

  /** Confirms a completed action. */
  public showSuccess(title: string, content = '', action?: INotificationAction): void {
    this.push({ kind: 'success', title, content }, action);
  }

  /** Warns about a condition the person may want to address. */
  public showWarning(title: string, content = '', action?: INotificationAction): void {
    this.push({ kind: 'warning', title, content }, action);
  }

  /** Reports a failure. */
  public showError(title: string, content = '', action?: INotificationAction): void {
    this.push({ kind: 'error', title, content }, action);
  }

  /**
   * Reports a failed operation. Application errors carry stable message keys that become the
   * title; external messages keep their original text below a generic title.
   *
   * @param error - Caught failure.
   */
  public report(error: unknown): void {
    const message = error instanceof Error ? error.message : '';
    if (message && isTranslationKey(message)) this.showError(message);
    else this.showError('loc.resonanz.error.operation', message);
  }

  /**
   * Shows a notice only the first time its key occurs while the window lives, for persisted
   * states such as a session error that would otherwise repeat on every visit.
   *
   * @param key - Identity of the state.
   * @param notification - Notice to show.
   */
  public pushOnce(key: string, notification: INotificationMessage): void {
    if (this._shownOnce.has(key)) return;
    this._shownOnce.add(key);
    this.push(notification);
  }

  /**
   * Shows one notice and keeps it in today's history.
   *
   * @param notification - Notice to show.
   * @param action - Optional toast action.
   */
  public push(notification: INotificationMessage, action?: INotificationAction): void {
    const notice: INotificationMessage = {
      ...notification,
      content: notification.content === notification.title ? '' : notification.content,
    };
    this._history.push(notice);
    this._toasts?.show(notice, action);
  }
}
