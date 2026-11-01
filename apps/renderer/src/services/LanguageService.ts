import { Injectable, effect, inject } from '@angular/core';
import { uiLanguage } from '@resonanz/intl';
import { LibraryStore } from './LibraryStore';
import { TranslateFacade } from './TranslateFacade';

/** Applies persisted interface language without changing capture ownership or the speech locale. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly _library = inject(LibraryStore);
  private readonly _intl = inject(TranslateFacade);
  public constructor() {
    effect(() => this._intl.setLanguage(uiLanguage(this._library.settings().uiLanguage)));
  }
}
