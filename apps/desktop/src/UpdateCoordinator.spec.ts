// #region Imports
import type { UpdateState } from '@resonanz/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { IInstallerUpdate } from './IInstallerUpdate.js';
import type { IInstallerUpdateAdapter } from './IInstallerUpdateAdapter.js';
import type { IUpdateCoordinatorOptions } from './IUpdateCoordinatorOptions.js';
import { UpdateCoordinator, isNewerVersion } from './UpdateCoordinator.js';
// #endregion

const FEED = 'https://github.com/pixel-brewery/resonanz/releases/latest/download';
const INSTALLER: IInstallerUpdate = {
  version: '0.2.0',
  downloadUrl:
    'https://github.com/pixel-brewery/resonanz/releases/download/v0.2.0/Resonanz-0.2.0-arm64.dmg',
  fileName: 'Resonanz-0.2.0-arm64.dmg',
  bytes: 1000,
  sha256: 'a'.repeat(64),
};

function adapter(overrides: Partial<IInstallerUpdateAdapter> = {}): IInstallerUpdateAdapter {
  return {
    check: vi.fn(async () => INSTALLER),
    download: vi.fn(async () => '/tmp/resonanz-updates/0.2.0-x/Resonanz-0.2.0-arm64.dmg'),
    launch: vi.fn(async () => undefined),
    ...overrides,
  };
}

function coordinator(options: Partial<IUpdateCoordinatorOptions> = {}): UpdateCoordinator {
  let tick = 0;
  return new UpdateCoordinator({
    installerAdapter: adapter(),
    currentVersion: '0.1.0',
    feedUrl: FEED,
    platform: 'darwin',
    architecture: 'arm64',
    packaged: true,
    quitApplication: vi.fn(),
    // Each call advances one second so progress publishing is never throttled.
    now: () => new Date(Date.UTC(2026, 10, 1, 10, 0, tick++)),
    ...options,
  });
}

async function settled(target: UpdateCoordinator, kind: UpdateState['kind']): Promise<void> {
  await vi.waitFor(() => expect(target.snapshot().kind).toBe(kind));
}

describe('UpdateCoordinator', () => {
  it('stays disabled in development, on unsupported platforms and without a trusted feed', () => {
    expect(coordinator({ packaged: false }).snapshot()).toMatchObject({
      kind: 'disabled',
      reason: 'development',
    });
    expect(coordinator({ platform: 'linux' }).snapshot()).toMatchObject({
      kind: 'disabled',
      reason: 'unsupported-platform',
    });
    expect(coordinator({ feedUrl: 'http://example.com/updates' }).snapshot()).toMatchObject({
      kind: 'disabled',
      reason: 'not-configured',
    });
    expect(coordinator({ feedUrl: '' }).snapshot()).toMatchObject({
      kind: 'disabled',
      reason: 'not-configured',
    });
  });

  it('checks the manifest of the running target and offers a newer version', async () => {
    const installer = adapter();
    const target = coordinator({ installerAdapter: installer });
    const states: UpdateState['kind'][] = [];
    target.subscribe((state) => states.push(state.kind));

    const state = await target.check();

    expect(installer.check).toHaveBeenCalledWith({
      url: `${FEED}/update-darwin-arm64.json`,
      platform: 'darwin',
      architecture: 'arm64',
    });
    expect(state).toMatchObject({ kind: 'available', targetVersion: '0.2.0' });
    expect(state.lastCheckedAt).toBeDefined();
    expect(states).toEqual(['idle', 'checking', 'available']);
  });

  it('reports up to date without a manifest or with the same version', async () => {
    const missing = coordinator({
      installerAdapter: adapter({ check: vi.fn(async () => undefined) }),
    });
    const same = coordinator({
      installerAdapter: adapter({ check: vi.fn(async () => ({ ...INSTALLER, version: '0.1.0' })) }),
    });

    expect(await missing.check()).toMatchObject({ kind: 'idle' });
    expect(await same.check()).toMatchObject({ kind: 'idle' });
    expect(missing.download()).toBe(false);
  });

  it('turns a failed check into a stable message key', async () => {
    const target = coordinator({
      installerAdapter: adapter({
        check: vi.fn(async () => {
          throw new Error('offline');
        }),
      }),
    });

    expect(await target.check()).toMatchObject({
      kind: 'failed',
      code: 'CHECK_FAILED',
      message: 'loc.resonanz.update.checkFailed',
    });
  });

  it('downloads with progress, becomes ready and installs by opening the installer and quitting', async () => {
    const quitApplication = vi.fn();
    const installer = adapter({
      download: vi.fn(async (_installer, options) => {
        options.onProgress(250);
        options.onProgress(1000);
        return '/tmp/resonanz-updates/0.2.0-x/Resonanz-0.2.0-arm64.dmg';
      }),
    });
    const target = coordinator({ installerAdapter: installer, quitApplication });
    const progress: number[] = [];
    target.subscribe((state) => {
      if (state.kind === 'downloading' && state.progress !== undefined)
        progress.push(state.progress);
    });
    await target.check();

    expect(target.download()).toBe(true);
    await settled(target, 'ready');

    expect(progress).toEqual([0, 0.25, 1]);
    expect(target.snapshot()).toMatchObject({ kind: 'ready', targetVersion: '0.2.0' });
    expect(await target.check()).toMatchObject({ kind: 'ready' });
    expect(await target.install()).toBe(true);
    expect(installer.launch).toHaveBeenCalledWith(
      '/tmp/resonanz-updates/0.2.0-x/Resonanz-0.2.0-arm64.dmg',
    );
    expect(quitApplication).toHaveBeenCalledOnce();
  });

  it('reports failed downloads and installations', async () => {
    const failingDownload = coordinator({
      installerAdapter: adapter({
        download: vi.fn(async () => {
          throw new Error('checksum');
        }),
      }),
    });
    await failingDownload.check();
    failingDownload.download();
    await settled(failingDownload, 'failed');
    expect(failingDownload.snapshot()).toMatchObject({ code: 'DOWNLOAD_FAILED' });

    const quitApplication = vi.fn();
    const failingInstall = coordinator({
      quitApplication,
      installerAdapter: adapter({
        launch: vi.fn(async () => {
          throw new Error('The disk image could not be opened.');
        }),
      }),
    });
    await failingInstall.check();
    failingInstall.download();
    await settled(failingInstall, 'ready');
    expect(await failingInstall.install()).toBe(false);
    expect(failingInstall.snapshot()).toMatchObject({ kind: 'failed', code: 'INSTALL_FAILED' });
    expect(quitApplication).not.toHaveBeenCalled();
  });

  it('does not install before an update is ready', async () => {
    const quitApplication = vi.fn();
    const target = coordinator({ quitApplication });

    expect(await target.install()).toBe(false);
    expect(quitApplication).not.toHaveBeenCalled();
  });
});

describe('isNewerVersion', () => {
  it('compares numeric versions part by part', () => {
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false);
    expect(() => isNewerVersion('1.0', '0.1.0')).toThrow();
  });
});
