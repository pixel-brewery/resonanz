import { describe, expect, it } from 'vitest';
import { translations } from './assets/i18n/lang.registry.js';
import { isTranslationKey, translate, translateMessage, uiLanguage } from './translate.js';

describe('interface translation tables', () => {
  it('keeps both catalogs complete with identical positional placeholders', () => {
    expect(Object.keys(translations.de).sort()).toEqual(Object.keys(translations.en).sort());
    for (const key of Object.keys(translations.en)) {
      if (!isTranslationKey(key)) throw new Error(key);
      const english = translations.en[key];
      const german = translations.de[key];
      expect(english.trim(), key).not.toBe('');
      expect(german.trim(), key).not.toBe('');
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\d+)\}/gu)].map((m) => m[1]).sort();
      expect(placeholders(german), key).toEqual(placeholders(english));
    }
  });
  it('defaults legacy and unsupported settings to English and preserves external text', () => {
    expect(uiLanguage(undefined)).toBe('en');
    expect(uiLanguage('fr')).toBe('en');
    expect(uiLanguage('de')).toBe('de');
    expect(translate('en', 'loc.resonanz.session.playFrom', '1:23')).toBe('Play from 1:23');
    expect(translate('de', 'loc.resonanz.session.playFrom', '1:23')).toBe('Ab 1:23 anhören');
    expect(translateMessage('de', 'loc.resonanz.error.sessionMissing')).toBe(
      'Die Aufzeichnung wurde nicht gefunden.',
    );
    expect(translateMessage('en', 'My own session title')).toBe('My own session title');
    expect(translateMessage('de', 'Provider: unavailable')).toBe('Provider: unavailable');
  });
});
