// #region Imports
import { InjectionToken } from '@angular/core';
import type { INotificationAction, INotificationMessage } from './INotificationMessage';
// #endregion

/**
 * Shows one notice as a transient toast. The shell binds it to Mosaik's toast service; without a
 * binding notices only reach the notification centre.
 *
 * @public
 */
export interface INotificationToasts {
  show(notification: INotificationMessage, action?: INotificationAction): void;
}

/**
 * Toast presenter used by `NotificationService`.
 *
 * @public
 */
export const NOTIFICATION_TOASTS = new InjectionToken<INotificationToasts>('NOTIFICATION_TOASTS');
