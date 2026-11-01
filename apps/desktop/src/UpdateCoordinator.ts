// #region Imports
import { updateStateSchema, type UpdateState } from '@resonanz/contracts';
import type { IInstallerUpdate } from './IInstallerUpdate.js';
import type { IInstallerUpdateAdapter } from './IInstallerUpdateAdapter.js';
import type { IUpdateCoordinatorOptions } from './IUpdateCoordinatorOptions.js';
import { updateManifestName } from './UpdateFeed.js';
// #endregion

// Download progress reaches the window over IPC: one message per whole percent and at most one
// every 150 ms keeps the status-bar ring fluid without flooding the renderer.
const PROGRESS_PUBLISH_INTERVAL_MS = 150;

type FailureCode = Extract<UpdateState, { kind: 'failed' }>['code'];

const failureMessages: Readonly<Record<FailureCode, string>> = {
  CHECK_FAILED: 'loc.resonanz.update.checkFailed',
  DOWNLOAD_FAILED: 'loc.resonanz.update.downloadFailed',
  INSTALL_FAILED: 'loc.resonanz.update.installFailed',
};

/**
 * Owns Resonanz's desktop update lifecycle (Symphony's update coordinator, installer path): it
 * checks a credential-free HTTPS manifest, downloads the advertised installer in the background
 * with verified size and SHA-256, and on request opens it and quits so it can replace the app.
 *
 * @public
 */
export class UpdateCoordinator {
  private readonly _adapter: IInstallerUpdateAdapter;
  private readonly _currentVersion: string;
  private readonly _feedUrl: string;
  private readonly _platform: NodeJS.Platform;
  private readonly _architecture: string;
  private readonly _packaged: boolean;
  private readonly _quitApplication: () => void;
  private readonly _now: () => Date;
  private readonly _listeners = new Set<(state: UpdateState) => void>();
  private _available?: IInstallerUpdate;
  private _activeDownload?: AbortController;
  private _downloadedPath?: string;
  private _state: UpdateState;

  public constructor(options: IUpdateCoordinatorOptions) {
    this._adapter = options.installerAdapter;
    this._currentVersion = options.currentVersion;
    this._feedUrl = options.feedUrl.trim();
    this._platform = options.platform;
    this._architecture = options.architecture;
    this._packaged = options.packaged;
    this._quitApplication = options.quitApplication;
    this._now = options.now ?? (() => new Date());
    this._state = this.initialState();
  }

  /** Current state. */
  public snapshot(): UpdateState {
    return this._state;
  }

  /**
   * Subscribes to state changes and receives the current state immediately.
   *
   * @param listener - Receives every published state.
   * @returns Unsubscribes the listener.
   */
  public subscribe(listener: (state: UpdateState) => void): () => void {
    this._listeners.add(listener);
    listener(this._state);
    return () => this._listeners.delete(listener);
  }

  /** Cancels a running download and releases listeners. */
  public dispose(): void {
    this._activeDownload?.abort();
    this._activeDownload = undefined;
    this._listeners.clear();
  }

  /**
   * Checks the manifest. A missing manifest means Resonanz is up to date; a running check or
   * download, a ready update or disabled updates are returned unchanged.
   */
  public async check(): Promise<UpdateState> {
    const kind = this._state.kind;
    if (kind === 'disabled' || kind === 'ready' || kind === 'checking' || kind === 'downloading')
      return this._state;
    this.transition({ ...this.base(), kind: 'checking' });
    try {
      const installer = await this._adapter.check({
        url: `${this._feedUrl.replace(/\/+$/u, '')}/${updateManifestName(this._platform, this._architecture)}`,
        platform: this._platform,
        architecture: this._architecture,
      });
      const lastCheckedAt = this._now().toISOString();
      if (installer && isNewerVersion(installer.version, this._currentVersion)) {
        this._available = installer;
        this.transition({
          currentVersion: this._currentVersion,
          lastCheckedAt,
          kind: 'available',
          targetVersion: installer.version,
        });
      } else {
        this._available = undefined;
        this.transition({ currentVersion: this._currentVersion, lastCheckedAt, kind: 'idle' });
      }
    } catch {
      this.fail('CHECK_FAILED');
    }
    return this._state;
  }

  /**
   * Starts the background download of the available installer. The state moves to `downloading`
   * with a progress share, then to `ready` once size and checksum match, or to `failed`.
   *
   * @returns Whether a download runs after the call.
   */
  public download(): boolean {
    if (this._state.kind === 'downloading' && this._activeDownload) return true;
    const installer = this._available;
    if (this._state.kind !== 'available' || !installer) return false;
    const controller = new AbortController();
    this._activeDownload = controller;
    this._downloadedPath = undefined;
    this.transition({
      ...this.base(),
      kind: 'downloading',
      targetVersion: installer.version,
      progress: 0,
    });
    void this.runDownload(installer, controller);
    return true;
  }

  /**
   * Opens the verified installer and quits Resonanz so it can be replaced.
   *
   * @returns Whether the installation started.
   */
  public async install(): Promise<boolean> {
    if (this._state.kind !== 'ready' || !this._downloadedPath) return false;
    try {
      await this._adapter.launch(this._downloadedPath);
      this._quitApplication();
      return true;
    } catch {
      this._downloadedPath = undefined;
      this.fail('INSTALL_FAILED');
      return false;
    }
  }

  private async runDownload(
    installer: IInstallerUpdate,
    controller: AbortController,
  ): Promise<void> {
    let publishedPercent = 0;
    let publishedAt = this._now().getTime();
    try {
      const path = await this._adapter.download(installer, {
        signal: controller.signal,
        onProgress: (receivedBytes) => {
          if (this._activeDownload !== controller || this._state.kind !== 'downloading') return;
          const percent = Math.min(100, Math.floor((receivedBytes / installer.bytes) * 100));
          const at = this._now().getTime();
          if (percent <= publishedPercent || at - publishedAt < PROGRESS_PUBLISH_INTERVAL_MS)
            return;
          publishedPercent = percent;
          publishedAt = at;
          this.transition({ ...this._state, progress: percent / 100 });
        },
      });
      if (this._activeDownload !== controller) return;
      this._activeDownload = undefined;
      this._downloadedPath = path;
      this.transition({
        ...this.base(),
        kind: 'ready',
        targetVersion: installer.version,
        downloadedAt: this._now().toISOString(),
      });
    } catch {
      if (this._activeDownload !== controller) return;
      this._activeDownload = undefined;
      this.fail('DOWNLOAD_FAILED');
    }
  }

  private initialState(): UpdateState {
    const base = { currentVersion: this._currentVersion } as const;
    if (!this._packaged) return { ...base, kind: 'disabled', reason: 'development' };
    if (this._platform !== 'darwin' && this._platform !== 'win32')
      return { ...base, kind: 'disabled', reason: 'unsupported-platform' };
    if (!isTrustedFeed(this._feedUrl))
      return { ...base, kind: 'disabled', reason: 'not-configured' };
    return { ...base, kind: 'idle' };
  }

  private base(): { readonly currentVersion: string; readonly lastCheckedAt?: string } {
    return {
      currentVersion: this._currentVersion,
      ...(this._state.lastCheckedAt ? { lastCheckedAt: this._state.lastCheckedAt } : {}),
    };
  }

  private fail(code: FailureCode): void {
    this.transition({ ...this.base(), kind: 'failed', code, message: failureMessages[code] });
  }

  private transition(state: UpdateState): void {
    this._state = updateStateSchema.parse(state);
    for (const listener of this._listeners) listener(this._state);
  }
}

/**
 * Compares numeric `major.minor.patch` versions.
 *
 * @param candidate - Advertised version.
 * @param current - Running version.
 * @returns Whether the candidate is newer.
 * @public
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (value: string): number[] | undefined => {
    const parts = value.split('.').map(Number);
    return parts.length === 3 && parts.every((part) => Number.isInteger(part) && part >= 0)
      ? parts
      : undefined;
  };
  const next = parse(candidate);
  const running = parse(current);
  if (!next || !running) throw new Error('Update versions must use numeric major.minor.patch.');
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== running[index]) return (next[index] ?? 0) > (running[index] ?? 0);
  }
  return false;
}

function isTrustedFeed(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}
