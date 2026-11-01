// @vitest-environment jsdom
// #region Imports
import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NotificationHistory } from './NotificationHistory';
import { NotificationService } from './NotificationService';
import { NOTIFICATION_TOASTS, type INotificationToasts } from './NotificationToasts';
// #endregion

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
afterAll(() => getTestBed().resetTestEnvironment());

function setup(focused = true): {
  service: NotificationService;
  history: NotificationHistory;
  toasts: INotificationToasts;
} {
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused);
  const toasts: INotificationToasts = { show: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: NOTIFICATION_TOASTS, useValue: toasts },
    ],
  });
  return {
    service: TestBed.inject(NotificationService),
    history: TestBed.inject(NotificationHistory),
    toasts,
  };
}

describe('NotificationService', () => {
  it('shows a toast and keeps the notice in today’s history', () => {
    const { service, history, toasts } = setup();
    const action = { label: 'Restart', handler: vi.fn() };

    service.showInfo(
      'loc.resonanz.update.readyTitle',
      'loc.resonanz.update.readyDescription',
      action,
    );

    expect(toasts.show).toHaveBeenCalledWith(
      {
        kind: 'info',
        title: 'loc.resonanz.update.readyTitle',
        content: 'loc.resonanz.update.readyDescription',
      },
      action,
    );
    expect(history.notices()).toMatchObject([
      { kind: 'info', title: 'loc.resonanz.update.readyTitle', read: true },
    ]);
  });

  it('keeps application error keys as titles and external messages as content', () => {
    const { service, history } = setup();

    service.report(new Error('loc.resonanz.error.signInRequired'));
    service.report(new Error('spawn claude ENOENT'));
    service.report('not an error');

    expect(history.notices().map(({ title, content }) => ({ title, content }))).toEqual([
      { title: 'loc.resonanz.error.operation', content: '' },
      { title: 'loc.resonanz.error.operation', content: 'spawn claude ENOENT' },
      { title: 'loc.resonanz.error.signInRequired', content: '' },
    ]);
  });

  it('reports a persisted state only once', () => {
    const { service, history } = setup();
    const notice = {
      kind: 'warning',
      title: 'loc.resonanz.session.errorNotice',
      content: 'x',
    } as const;

    service.pushOnce('session-error:a:x', notice);
    service.pushOnce('session-error:a:x', notice);

    expect(history.notices()).toHaveLength(1);
  });

  it('counts notices that arrive in the background as unread until marked read', () => {
    const { service, history } = setup(false);

    service.showError('loc.resonanz.update.checkFailed');
    service.showWarning('loc.resonanz.update.notReady');
    expect(history.unreadCount()).toBe(2);

    history.markAllAsRead();
    expect(history.unreadCount()).toBe(0);
    expect(history.readCount()).toBe(2);

    history.clearRead();
    expect(history.notices()).toEqual([]);
  });

  it('drops notices from previous days', () => {
    const { history } = setup();
    const yesterday = new Date(2026, 9, 31, 18, 0).getTime();
    const today = new Date(2026, 10, 1, 9, 0).getTime();
    history.push({ kind: 'info', title: 'old', content: '' }, yesterday);
    history.push({ kind: 'info', title: 'new', content: '' }, today);

    history.prune(today);

    expect(history.notices().map((notice) => notice.title)).toEqual(['new']);
  });
});
