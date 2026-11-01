// #region Imports
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { form, maxLength, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { LibraryStore } from '../services/LibraryStore';
import { CapturePresenter } from './CapturePresenter';
import { DesktopApi } from '../services/DesktopApi';
import type { ResponsePayload, RequestPayload } from '@resonanz/contracts';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
// #endregion

/** Owns shell commands while views remain declarative Mosaik composition. */
@Injectable({ providedIn: 'root' })
export class ShellPresenter {
  private readonly _router = inject(Router);
  private readonly _url = toSignal(this._router.events.pipe(map(() => this._router.url)), {
    initialValue: this._router.url,
  });
  private readonly _api = inject(DesktopApi);
  private _statusVersion = 0;
  private readonly _collectionModel = signal({ name: '' });
  public readonly library = inject(LibraryStore);
  public readonly capture = inject(CapturePresenter);
  public readonly creatingCollection = signal(false);
  public readonly savingCollection = signal(false);
  public readonly capturePanelOpen = signal(false);
  public readonly nativeTray = signal(false);
  public readonly focusMode = computed(() =>
    /^\/(?:voice|settings|onboarding)(?:\/|$)/u.test(this._url()),
  );
  private readonly _windowSurface = computed<RequestPayload<'window.present'>['surface']>(() =>
    /^\/settings(?:[/?]|$)/u.test(this._url())
      ? 'settings'
      : /^\/onboarding(?:[/?]|$)/u.test(this._url())
        ? 'onboarding'
        : 'workspace',
  );
  public readonly assistantStatus = signal<ResponsePayload<'assistant.status'> | null>(null);
  public readonly installations = signal<ResponsePayload<'assistant.detect'>>([]);
  public readonly assistantName = computed(() =>
    this.library.settings().assistant.provider === 'claude' ? 'Claude Code' : 'Codex',
  );
  private readonly _assistantBinding = computed(() =>
    JSON.stringify(this.library.settings().assistant),
  );
  public constructor() {
    effect(() => {
      const surface = this._windowSurface();
      if (!this.nativeTray())
        void this._api
          .request('window.present', { surface })
          .catch((error) => this.library.report(error));
    });
    effect(() => {
      this._assistantBinding();
      void this.refreshAssistant();
    });
    this.library.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type !== 'ui.command') return;
      if (event.command === 'tray.open') {
        this.nativeTray.set(true);
        this.capturePanelOpen.set(true);
      }
      if (event.command === 'window.open') {
        this.nativeTray.set(false);
        this.capturePanelOpen.set(false);
      }
      if (event.command === 'voice.open') {
        if (!this._router.url.startsWith('/voice')) void this.openVoice();
        else void this._api.request('window.show', {}).catch((error) => this.library.report(error));
      }
    });
    this.library.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (
        event.type === 'assistant.login' &&
        ['succeeded', 'failed', 'cancelled'].includes(event.event.state)
      )
        void this.refreshAssistant();
    });
  }
  public readonly collectionForm = form(this._collectionModel, (schema) => {
    required(schema.name);
    maxLength(schema.name, 80);
  });

  /** Loads the desktop projection when the shell mounts. */
  public async initialize(): Promise<void> {
    await this.library.initialize();
    try {
      this.installations.set(await this._api.request('assistant.detect', {}));
    } catch {
      /* Selected account has its own diagnostic. */
    }
  }
  public async refreshAssistant(): Promise<void> {
    const version = ++this._statusVersion;
    try {
      const status = await this._api.request('assistant.status', {});
      if (version === this._statusVersion) this.assistantStatus.set(status);
    } catch {
      if (version === this._statusVersion) this.assistantStatus.set(null);
    }
  }
  public openCapture(): void {
    void this._api.request('window.tray', {}).catch((error) => this.library.report(error));
  }
  public async openLibrary(): Promise<void> {
    this.capturePanelOpen.set(false);
    this.nativeTray.set(false);
    await this._api.request('window.show', {});
    await this._router.navigate(['/']);
  }
  public async openVoice(): Promise<void> {
    this.capturePanelOpen.set(false);
    this.nativeTray.set(false);
    await this._api.request('window.show', {});
    await this._router.navigate(
      this.capture.mode() === 'conversation' && this.capture.sessionId()
        ? ['/voice', this.capture.sessionId()]
        : ['/voice'],
    );
  }
  public async closeCapture(): Promise<void> {
    this.capturePanelOpen.set(false);
    if (this.nativeTray()) await this._api.request('window.hide', {});
  }
  public async openSettings(): Promise<void> {
    this.capturePanelOpen.set(false);
    this.nativeTray.set(false);
    await this._api.request('window.show', {});
    await this._router.navigate(['/settings']);
  }

  /** Creates a named collection once, then opens it. */
  public async createCollection(): Promise<void> {
    if (this.collectionForm().invalid() || this.savingCollection()) return;
    this.savingCollection.set(true);
    try {
      await this.library.createCollection(this._collectionModel().name);
      this._collectionModel.set({ name: '' });
      this.creatingCollection.set(false);
    } catch (error) {
      this.library.report(error);
    } finally {
      this.savingCollection.set(false);
    }
  }

  /** Imports a selected recording/session through the native file picker. */
  public async importSession(): Promise<void> {
    try {
      const session = await this.library.importSession();
      if (session) await this._router.navigate(['/session', session.id]);
    } catch (error) {
      this.library.report(error);
    }
  }
}
