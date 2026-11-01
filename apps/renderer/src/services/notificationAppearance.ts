// #region Imports
import type { NotificationKind } from './INotificationMessage';
// #endregion

/**
 * Mosaik variant of a notice kind.
 *
 * @public
 */
export function notificationVariant(
  kind: NotificationKind,
): 'info' | 'success' | 'warning' | 'danger' {
  return kind === 'error' ? 'danger' : kind;
}

/**
 * Icon of a notice kind.
 *
 * @public
 */
export function notificationIcon(kind: NotificationKind): string {
  switch (kind) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'info';
  }
}
