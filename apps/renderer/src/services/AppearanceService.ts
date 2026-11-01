import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { ThemeService } from '@pixel-brewery/mosaik-elements-angular';
import { LibraryStore } from './LibraryStore';

/** Applies the exported Resonanz palette on Soho and follows system changes by default. */
@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly _theme = inject(ThemeService);
  private readonly _library = inject(LibraryStore);
  private readonly _media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly _systemDark = signal(this._media.matches);
  public constructor() {
    const changed = (event: MediaQueryListEvent) => this._systemDark.set(event.matches);
    this._media.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => this._media.removeEventListener('change', changed));
    effect(() => {
      const preference = this._library.settings().appearance ?? 'system';
      const mode = preference === 'system' ? (this._systemDark() ? 'dark' : 'light') : preference;
      this._theme.applyTheme(mode);
      document.documentElement.style.colorScheme = mode;
      document.documentElement.dataset['appearance'] = mode;
    });
  }
}
