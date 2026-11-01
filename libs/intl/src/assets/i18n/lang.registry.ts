import en from './lang.en.json';
import de from './lang.de.json';

/** Flat translation tables, registered with the public Mosaik translation service. */
export const translations = { en, de } as const;
export type UiLanguage = keyof typeof translations;
export type TranslationKey = keyof typeof en;
