import { translations, type TranslationKey, type UiLanguage } from './assets/i18n/lang.registry.js';

/** Legacy settings and unsupported language values always resolve to English. */
export function uiLanguage(value: unknown): UiLanguage {
  return value === 'de' ? 'de' : 'en';
}

export function isTranslationKey(value: string): value is TranslationKey {
  return Object.hasOwn(translations.en, value);
}

/** Matches Mosaik's positional interpolation without any renderer or Node dependency. */
export function translate(
  language: UiLanguage,
  key: TranslationKey,
  ...parameters: readonly (string | number)[]
): string {
  return translations[language][key].replace(/\{(\d+)\}/gu, (match, index: string) =>
    parameters[Number(index)] === undefined ? match : String(parameters[Number(index)]),
  );
}

/** Application errors cross IPC as stable keys. External/provider messages remain verbatim. */
export function translateMessage(language: UiLanguage, value: string): string {
  return isTranslationKey(value) ? translate(language, value) : value;
}
