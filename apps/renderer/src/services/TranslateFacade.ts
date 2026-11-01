import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@pixel-brewery/mosaik-elements-angular';
import { map } from 'rxjs';
import { isTranslationKey, uiLanguage, type TranslationKey, type UiLanguage } from '@resonanz/intl';

/** Signal facade over Mosaik's translation service, with English as the default. */
@Injectable({ providedIn: 'root' })
export class TranslateFacade {
  private readonly _translate = inject(TranslateService);
  public readonly currentLanguage = toSignal(
    this._translate.languageChanged.pipe(map(() => uiLanguage(this._translate.currentLanguage))),
    { initialValue: uiLanguage(this._translate.currentLanguage) },
  );
  public readonly locale = computed(() => (this.currentLanguage() === 'de' ? 'de-DE' : 'en-US'));
  public readonly languages = [
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
  ] as const;

  public t(key: TranslationKey, ...parameters: readonly (string | number)[]): string {
    this.currentLanguage();
    return this._translate.translate(key, ...parameters);
  }
  public message(value: string): string {
    return isTranslationKey(value) ? this.t(value) : value;
  }
  public setLanguage(language: UiLanguage): void {
    this._translate.currentLanguage = language;
  }
  public durationLabel(milliseconds: number): string {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes >= 60
      ? this.t('loc.resonanz.units.hoursMinutes', Math.floor(minutes / 60), minutes % 60)
      : minutes > 0
        ? this.t('loc.resonanz.units.minutes', minutes)
        : this.t('loc.resonanz.units.seconds', seconds);
  }
  public languageName(locale: string): string {
    try {
      return (
        new Intl.DisplayNames([this.locale()], { type: 'language' }).of(locale.split('-')[0]!) ??
        locale
      );
    } catch {
      return locale;
    }
  }
  public dueLabel(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
    if (!match) return value;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (
      date.getFullYear() !== Number(match[1]) ||
      date.getMonth() + 1 !== Number(match[2]) ||
      date.getDate() !== Number(match[3])
    )
      return value;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.getTime() === today.getTime()) return this.t('loc.resonanz.task.dueToday');
    if (date.getTime() === tomorrow.getTime()) return this.t('loc.resonanz.task.dueTomorrow');
    const label = new Intl.DateTimeFormat(this.locale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
    return this.t(date < today ? 'loc.resonanz.task.overdue' : 'loc.resonanz.task.dueOn', label);
  }
  public number(value: number, digits = 0): string {
    return new Intl.NumberFormat(this.locale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
}
