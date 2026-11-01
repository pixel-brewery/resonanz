/**
 * Kind of a notice; it selects the toast variant and the icon.
 *
 * @public
 */
export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

/**
 * One notice for the bottom toast and the notification centre. `title` and `content` are stable
 * `loc.resonanz.*` keys or original external text; they are translated only for display.
 *
 * @public
 */
export interface INotificationMessage {
  readonly kind: NotificationKind;
  readonly title: string;
  readonly content: string;
  /** Parameters for a keyed title. */
  readonly titleParameters?: readonly (string | number)[];
}

/**
 * Optional action shown on the toast, such as restarting for an update.
 *
 * @public
 */
export interface INotificationAction {
  readonly label: string;
  readonly handler: () => void;
}
