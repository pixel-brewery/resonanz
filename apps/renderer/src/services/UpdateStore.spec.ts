// @vitest-environment jsdom
// #region Imports
import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import type { AppEvent, UpdateState } from '@resonanz/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DesktopApi } from './DesktopApi';
import { NotificationService } from './NotificationService';
import { UpdateStore } from './UpdateStore';
// #endregion

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterEach(() => TestBed.resetTestingModule());
afterAll(() => getTestBed().resetTestEnvironment());

const idle: UpdateState = { kind: 'idle', currentVersion: '0.1.0' };

function setup(initial: UpdateState = idle) {
  let listener: ((event: AppEvent) => void) | undefined;
  const api = {
    request: vi.fn(async (method: string): Promise<unknown> => {
      if (method === 'updates.get') return initial;
      if (method === 'updates.check')
        return { ...idle, lastCheckedAt: '2026-11-01T10:00:00.000Z' } satisfies UpdateState;
      if (method === 'updates.download') return { outcome: 'started' };
      if (method === 'updates.install') return { outcome: 'capture-active' };
      throw new Error(method);
    }),
    onEvent: vi.fn((next: (event: AppEvent) => void) => {
      listener = next;
      return () => undefined;
    }),
  };
  const notifications = {
    push: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
    showError: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DesktopApi, useValue: api },
      { provide: NotificationService, useValue: notifications },
    ],
  });
  const store = TestBed.inject(UpdateStore);
  const publish = (state: UpdateState): void => listener?.({ type: 'update.state', state });
  return { store, api, notifications, publish };
}

describe('UpdateStore', () => {
  it('mirrors the desktop state and its published changes', async () => {
    const { store, publish } = setup();
    await store.initialize();
    expect(store.state()).toEqual(idle);

    publish({ ...idle, kind: 'downloading', targetVersion: '0.2.0', progress: 0.4 });

    expect(store.state()).toMatchObject({ kind: 'downloading', progress: 0.4 });
  });

  it('confirms a manual check that found nothing new', async () => {
    const { store, notifications } = setup();
    await store.initialize();

    await store.check();

    expect(notifications.showSuccess).toHaveBeenCalledWith('loc.resonanz.update.upToDate');
  });

  it('announces a ready update once', async () => {
    const { store, notifications, publish } = setup();
    await store.initialize();
    const ready: UpdateState = {
      ...idle,
      kind: 'ready',
      targetVersion: '0.2.0',
      downloadedAt: '2026-11-01T10:00:00.000Z',
    };

    publish(ready);
    publish(ready);

    expect(notifications.push).toHaveBeenCalledOnce();
    expect(notifications.push).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'loc.resonanz.update.readyTitle',
        titleParameters: ['0.2.0'],
      }),
    );
  });

  it('reports a failed download that it started', async () => {
    const available: UpdateState = { ...idle, kind: 'available', targetVersion: '0.2.0' };
    const { store, notifications, publish } = setup(available);
    await store.initialize();

    await store.download();
    publish({ ...idle, kind: 'downloading', targetVersion: '0.2.0', progress: 0.1 });
    publish({
      ...idle,
      kind: 'failed',
      code: 'DOWNLOAD_FAILED',
      message: 'loc.resonanz.update.downloadFailed',
    });

    expect(notifications.showError).toHaveBeenCalledWith('loc.resonanz.update.downloadFailed');
  });

  it('explains why a restart waits for the running capture', async () => {
    const { store, notifications } = setup();
    await store.initialize();

    await store.install();

    expect(notifications.showWarning).toHaveBeenCalledWith(
      'loc.resonanz.update.captureActive',
      'loc.resonanz.update.captureActiveDescription',
    );
  });
});
