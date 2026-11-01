// #region Imports
import { Injectable, inject } from '@angular/core';
import { ToastService } from '@pixel-brewery/mosaik-elements-angular';
import { isTranslationKey } from '@resonanz/intl';
import type { INotificationAction, INotificationMessage } from './INotificationMessage';
import type { INotificationToasts } from './NotificationToasts';
import { notificationIcon, notificationVariant } from './notificationAppearance';
import { TranslateFacade } from './TranslateFacade';
// #endregion

const TOAST_TIMEOUT_MILLISECONDS = 5_000;

/**
 * Shows notices as Mosaik toasts at the bottom left, like Symphony's toast interceptor.
 *
 * @public
 */
@Injectable()
export class MosaikNotificationToasts implements INotificationToasts {
  private readonly _toasts = inject(ToastService);
  private readonly _intl = inject(TranslateFacade);

  public show(notification: INotificationMessage, action?: INotificationAction): void {
    const title = isTranslationKey(notification.title)
      ? this._intl.t(notification.title, ...(notification.titleParameters ?? []))
      : notification.title;
    const toast = this._toasts.show({
      header: title,
      content: notification.content ? this._intl.message(notification.content) : '',
      timeout: action ? TOAST_TIMEOUT_MILLISECONDS * 2 : TOAST_TIMEOUT_MILLISECONDS,
      closeable: true,
      pressEscapeToClose: true,
      clickOutsideToClose: false,
      showProgress: false,
      appearance: 'soft',
      position: 'bottom-left',
      maxWidth: '480px',
      iconName: notificationIcon(notification.kind),
      variant: notificationVariant(notification.kind),
      ...(action
        ? { actions: [{ kind: 'primary' as const, label: action.label, handler: action.handler }] }
        : {}),
    });
    toast.element.setAttribute('test-id', `notification-${notification.kind}`);
  }
}
