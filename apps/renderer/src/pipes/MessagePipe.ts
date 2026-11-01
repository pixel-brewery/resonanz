import { Pipe, inject, type PipeTransform } from '@angular/core';
import { TranslateFacade } from '../services/TranslateFacade';

/** Resolves application-owned message keys and preserves external text and user content. */
@Pipe({ name: 'message', pure: false })
export class MessagePipe implements PipeTransform {
  private readonly _intl = inject(TranslateFacade);
  public transform(value: string | null | undefined): string {
    return value ? this._intl.message(value) : '';
  }
}
