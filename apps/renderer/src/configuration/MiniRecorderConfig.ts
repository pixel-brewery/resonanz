import { provideZonelessChangeDetection, type ApplicationConfig } from '@angular/core';
import {
  provideDefaultIconSet,
  provideIconSet,
  provideIcons,
  provideTheme,
  provideTranslationRegistry,
  provideTranslations,
} from '@pixel-brewery/mosaik-elements-angular';
import { ReiconAliases } from '@pixel-brewery/mosaik-elements-foundation/icons/reicon';
import { SohoTheme } from '@pixel-brewery/mosaik-themes';
import { translations } from '@resonanz/intl';
import { icons } from './Icons';
import { resonanzThemeOverrides } from './ResonanzTheme';

/** Intentionally excludes routing, library, media and workspace initialization. */
export const miniRecorderConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideTranslationRegistry({ defaultLanguageResolver: () => 'en' }),
    provideTranslations(translations),
    provideTheme({ theme: SohoTheme.SOHO_THEME, overrides: resonanzThemeOverrides, mode: 'light' }),
    provideIconSet('reicon', ReiconAliases),
    provideDefaultIconSet('reicon'),
    provideIcons(icons),
  ],
};
