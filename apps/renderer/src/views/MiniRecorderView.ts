import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ThemeService } from '@pixel-brewery/mosaik-elements-angular';
import {
  initialMiniRecorderSnapshot,
  type IMiniRecorderSnapshot,
  type MiniRecorderMode,
} from '@resonanz/contracts';
import { MiniRecorderComponent } from '../components/mini-recorder/MiniRecorderComponent';
import { DesktopApi } from '../services/DesktopApi';
import { TranslateFacade } from '../services/TranslateFacade';

/** Passive native surface. It has no capture, storage, router or account owner. */
@Component({
  selector: 'resonanz-mini-surface',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MiniRecorderComponent],
  templateUrl: './MiniRecorderView.html',
  styleUrl: './MiniRecorderView.scss',
})
export class MiniRecorderView {
  private readonly _api = inject(DesktopApi);
  private readonly _intl = inject(TranslateFacade);
  private readonly _theme = inject(ThemeService);
  private readonly _media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly _systemDark = signal(this._media.matches);
  private readonly _state = signal<IMiniRecorderSnapshot>(initialMiniRecorderSnapshot);
  private _version = 0;
  protected readonly snapshot = this._state.asReadonly();
  protected readonly error = signal<string | null>(null);

  public constructor() {
    const changed = (event: MediaQueryListEvent): void => this._systemDark.set(event.matches);
    this._media.addEventListener('change', changed);
    const unsubscribe = this._api.onEvent((event) => {
      if (event.type === 'mini.state') {
        this._version++;
        this._state.set(event.snapshot);
      }
    });
    const version = this._version;
    void this._api
      .request('mini.get', {})
      .then((snapshot) => {
        if (version === this._version) this._state.set(snapshot);
      })
      .catch((error) => this.report(error));
    effect(() => {
      const snapshot = this.snapshot();
      this._intl.setLanguage(snapshot.language);
      const mode =
        snapshot.appearance === 'system'
          ? this._systemDark()
            ? 'dark'
            : 'light'
          : snapshot.appearance;
      this._theme.applyTheme(mode);
      document.documentElement.style.colorScheme = mode;
    });
    const undo = (event: KeyboardEvent): void => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z' &&
        this.snapshot().feedback
      ) {
        event.preventDefault();
        void this.act('undo');
      }
    };
    window.addEventListener('keydown', undo);
    inject(DestroyRef).onDestroy(() => {
      unsubscribe();
      this._version++;
      this._media.removeEventListener('change', changed);
      window.removeEventListener('keydown', undo);
    });
  }

  protected async act(action: 'mark' | 'pause' | 'stop' | 'open' | 'undo'): Promise<void> {
    const { sessionId, active } = this.snapshot();
    if (!active || !sessionId) return;
    this.error.set(null);
    try {
      await this._api.request('mini.action', { sessionId, action });
    } catch (error) {
      this.report(error);
    }
  }

  protected async resize(mode: MiniRecorderMode): Promise<void> {
    try {
      await this._api.request('mini.resize', { mode });
    } catch (error) {
      this.report(error);
    }
  }

  private report(error: unknown): void {
    this.error.set(
      this._intl.message(error instanceof Error ? error.message : 'loc.resonanz.error.operation'),
    );
  }
}
