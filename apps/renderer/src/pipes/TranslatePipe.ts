import { Pipe, inject, type PipeTransform } from '@angular/core';
import { isTranslationKey } from '@resonanz/intl';
import { TranslateFacade } from '../services/TranslateFacade';

/** Mosaik 0.1.183's pure pipe caches unchanged keys across language changes. */
@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly _intl = inject(TranslateFacade);
  public transform(key: string): string {
    return isTranslationKey(key) ? this._intl.t(key) : `### ${key} ###`;
  }
}
