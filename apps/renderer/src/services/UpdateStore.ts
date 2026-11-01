// #region Imports
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { UpdateState } from '@resonanz/contracts';
import { DesktopApi } from './DesktopApi';
import { NotificationService } from './NotificationService';
// #endregion

/**
 * Mirrors the desktop update lifecycle for the status bar and settings (Symphony's desktop update
 * store). Results of a manual check, a failed download and a ready update are reported as
 * notifications at the bottom of the window; the status bar keeps the download and restart
 * controls.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class UpdateStore {
  private readonly _api = inject(DesktopApi);
  private readonly _notifications = inject(NotificationService);
  private readonly _state = signal<UpdateState | undefined>(undefined);
  private readonly _busy = signal(false);
  private _unsubscribe?: () => void;
  private _initialized?: Promise<void>;
  private _manualCheckPending = false;
  private _downloadStarted = false;
  private _announcedReadyVersion?: string;

  /** Current update state, undefined until the desktop answered. */
  public readonly state = this._state.asReadonly();

  /** Whether an update operation runs. */
  public readonly busy = this._busy.asReadonly();

  public constructor() {
    inject(DestroyRef).onDestroy(() => this._unsubscribe?.());
  }

  /** Attaches to the desktop update state once. */
  public initialize(): Promise<void> {
    this._initialized ??= this.initializeOnce();
    return this._initialized;
  }

  /** Checks for a new version and reports the result. */
  public async check(): Promise<void> {
    const current = this._state();
    if (!current || current.kind === 'disabled' || current.kind === 'ready') return;
    this._manualCheckPending = true;
    this._busy.set(true);
    try {
      this.apply(await this._api.request('updates.check', {}));
    } catch (error) {
      this._manualCheckPending = false;
      this._notifications.showError('loc.resonanz.update.checkFailed', messageOf(error));
    } finally {
      this._busy.set(false);
    }
  }

  /** Starts the background download of the available version. */
  public async download(): Promise<void> {
    if (this._state()?.kind !== 'available') return;
    this._busy.set(true);
    try {
      const result = await this._api.request('updates.download', {});
      if (result.outcome === 'started') this._downloadStarted = true;
      else this._notifications.showWarning('loc.resonanz.update.nothingToDownload');
    } catch (error) {
      this._notifications.showError('loc.resonanz.update.downloadFailed', messageOf(error));
    } finally {
      this._busy.set(false);
    }
  }

  /** Opens the downloaded installer and restarts Resonanz. */
  public async install(): Promise<void> {
    this._busy.set(true);
    try {
      const result = await this._api.request('updates.install', {});
      if (result.outcome === 'capture-active')
        this._notifications.showWarning(
          'loc.resonanz.update.captureActive',
          'loc.resonanz.update.captureActiveDescription',
        );
      else if (result.outcome === 'not-ready')
        this._notifications.showWarning('loc.resonanz.update.notReady');
    } catch (error) {
      this._notifications.showError('loc.resonanz.update.installFailed', messageOf(error));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Applies a published state and reports the transitions the person needs to know about.
   *
   * @param state - State from the desktop.
   */
  public apply(state: UpdateState): void {
    const previous = this._state();
    this._state.set(state);
    if (this._downloadStarted && state.kind !== 'downloading') {
      this._downloadStarted = false;
      if (previous?.kind === 'downloading' && state.kind === 'failed')
        this._notifications.showError('loc.resonanz.update.downloadFailed');
    }
    if (state.kind === 'ready' && state.targetVersion !== this._announcedReadyVersion) {
      this._announcedReadyVersion = state.targetVersion;
      this._manualCheckPending = false;
      this._notifications.push({
        kind: 'info',
        title: 'loc.resonanz.update.readyTitle',
        titleParameters: [state.targetVersion],
        content: 'loc.resonanz.update.readyDescription',
      });
      return;
    }
    if (!this._manualCheckPending) return;
    if (state.kind === 'idle' && state.lastCheckedAt) {
      this._manualCheckPending = false;
      this._notifications.showSuccess('loc.resonanz.update.upToDate');
    } else if (state.kind === 'available') {
      this._manualCheckPending = false;
      this._notifications.push({
        kind: 'info',
        title: 'loc.resonanz.update.availableTitle',
        titleParameters: [state.targetVersion],
        content: 'loc.resonanz.update.availableDescription',
      });
    } else if (state.kind === 'failed') {
      this._manualCheckPending = false;
      this._notifications.showError('loc.resonanz.update.checkFailed');
    }
  }

  private async initializeOnce(): Promise<void> {
    this._unsubscribe = this._api.onEvent((event) => {
      if (event.type === 'update.state') this.apply(event.state);
    });
    try {
      this.apply(await this._api.request('updates.get', {}));
    } catch {
      /* The status bar stays without update controls when the desktop cannot answer. */
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}
