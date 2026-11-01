// #region Imports
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  defaultSettings,
  type AppEvent,
  type IAppSnapshot,
  type ICapabilities,
  type ICollection,
  type ISession,
  type ISessionSummary,
  type ISettings,
  type IStorageUsage,
} from '@resonanz/contracts';
import { DesktopApi } from './DesktopApi';
import { NotificationService } from './NotificationService';
// #endregion

/** Owns the application projection and coalesces committed native changes. */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  // #region Fields
  private readonly _api = inject(DesktopApi);
  private readonly _notifications = inject(NotificationService);
  private readonly _sessions = signal<readonly ISessionSummary[]>([]);
  private readonly _collections = signal<readonly ICollection[]>([]);
  private readonly _settings = signal<ISettings>(defaultSettings);
  private readonly _capabilities = signal<ICapabilities | null>(null);
  private readonly _loading = signal(true);
  private readonly _storage = signal<IStorageUsage | null>(null);
  private readonly _measuringStorage = signal(false);
  private _storageRefresh: Promise<void> | null = null;
  private _storageRefreshRequired = false;
  private _destroyed = false;
  private readonly _events = new Subject<AppEvent>();
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _loadVersion = 0;
  private _unsubscribe: (() => void) | null = null;
  public readonly sessions = this._sessions.asReadonly();
  public readonly collections = this._collections.asReadonly();
  public readonly settings = this._settings.asReadonly();
  public readonly capabilities = this._capabilities.asReadonly();
  public readonly loading = this._loading.asReadonly();
  public readonly storage = this._storage.asReadonly();
  public readonly measuringStorage = this._measuringStorage.asReadonly();
  public readonly events = this._events.asObservable();
  // #endregion

  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      this._destroyed = true;
      this._unsubscribe?.();
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this._events.complete();
    });
  }

  /** Loads the library and attaches the one application event subscription. */
  public async initialize(): Promise<void> {
    try {
      this._unsubscribe ??= this._api.onEvent((event) => this.receive(event));
      await this.refresh();
    } catch (error) {
      this.report(error);
      this._loading.set(false);
    }
  }

  /** Refreshes native state without accepting stale responses. */
  public async refresh(): Promise<void> {
    const version = ++this._loadVersion;
    try {
      const snapshot = await this._api.request('bootstrap.get', {});
      if (version === this._loadVersion) this.apply(snapshot);
    } catch (error) {
      if (version === this._loadVersion) this.report(error);
    } finally {
      if (version === this._loadVersion) this._loading.set(false);
    }
  }

  /** Explicitly measures library storage, coalescing concurrent requests into the latest observation. */
  public refreshStorage(): Promise<void> {
    this._storageRefreshRequired = true;
    if (this._storageRefresh) return this._storageRefresh;
    this._measuringStorage.set(true);
    const work = (async () => {
      while (this._storageRefreshRequired && !this._destroyed) {
        this._storageRefreshRequired = false;
        try {
          const usage = await this._api.request('storage.usage', {});
          if (!this._destroyed) this._storage.set(usage);
        } catch (error) {
          if (!this._destroyed) this.report(error);
        }
      }
    })().finally(() => {
      this._storageRefresh = null;
      this._measuringStorage.set(false);
    });
    this._storageRefresh = work;
    return work;
  }

  /**
   * Reports a failed operation as a notification at the bottom of the window (toast and
   * notification centre) instead of a banner above the workspace.
   */
  public report(error: unknown): void {
    this._notifications.report(error);
  }

  /** Creates a collection and refreshes its projection. */
  public async createCollection(name: string): Promise<void> {
    await this._api.request('collections.create', { name });
    await this.refresh();
  }

  /** Saves only non-secret settings. */
  public async saveSettings(settings: Partial<ISettings>): Promise<void> {
    this._settings.set(await this._api.request('settings.save', settings));
  }

  /** Imports a session selected through the native dialog. */
  public async importSession(): Promise<ISession | null> {
    const imported = await this._api.request('sessions.import', {});
    if (imported) await this.refresh();
    return imported;
  }

  private apply(snapshot: IAppSnapshot): void {
    this._sessions.set(snapshot.sessions);
    this._collections.set(snapshot.collections);
    this._settings.set(snapshot.settings);
    this._capabilities.set(snapshot.capabilities);
  }

  private receive(event: AppEvent): void {
    this._events.next(event);
    if (event.type === 'storage.failed') this.report(new Error(event.message));
    if (
      event.type === 'library.changed' ||
      event.type === 'storage.failed' ||
      event.type === 'session.updated' ||
      (event.type === 'runtime.status' && event.state === 'ready')
    ) {
      if (this._refreshTimer) return;
      this._refreshTimer = setTimeout(() => {
        this._refreshTimer = null;
        void this.refresh();
      }, 180);
    }
    if (event.type === 'runtime.status' && event.state === 'stopped') {
      this.report(new Error(event.message ?? 'loc.resonanz.error.backgroundStopped'));
    }
  }
}
