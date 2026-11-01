// #region Imports
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeEn from '@angular/common/locales/en';
import { translations } from '@resonanz/intl';
import { LOCALE_ID, provideZonelessChangeDetection, type ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import {
  provideAppComponent,
  provideDefaultIconSet,
  provideIconSet,
  provideIcons,
  provideTheme,
  provideTranslationRegistry,
  provideTranslations,
  provideToasts,
  withToastStackBehavior,
} from '@pixel-brewery/mosaik-elements-angular';
import { ReiconAliases } from '@pixel-brewery/mosaik-elements-foundation/icons/reicon';
import { SohoTheme } from '@pixel-brewery/mosaik-themes';
import { RealtimeAudioWorkletModuleLoader, provideAudioServices } from '@resonanz/audio';
import { AUDIO_HOST } from '../audio/AUDIO_HOST';
import { SelfHostedRealtimeAudioWorkletModuleLoader } from '../audio/SelfHostedRealtimeAudioWorkletModuleLoader';
import { DesktopAudioHost } from '../services/DesktopAudioHost';
import { MosaikNotificationToasts } from '../services/MosaikNotificationToasts';
import { NOTIFICATION_TOASTS } from '../services/NotificationToasts';
import { icons } from './Icons';
import { shellRoutes } from './ShellRoutes';
import { resonanzThemeOverrides } from './ResonanzTheme';
// #endregion

registerLocaleData(localeDe);
registerLocaleData(localeEn);

/** Reuses Symphony's zoneless Angular, Soho theme and icon registration. */
export const shellConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    { provide: LOCALE_ID, useValue: 'en-US' },
    provideTranslationRegistry({ defaultLanguageResolver: () => 'en' }),
    provideTranslations(translations),
    provideRouter(shellRoutes, withHashLocation()),
    provideTheme({ theme: SohoTheme.SOHO_THEME, overrides: resonanzThemeOverrides, mode: 'light' }),
    provideAppComponent({ hasHeader: false, hasNav: false }),
    provideIconSet('reicon', ReiconAliases),
    provideDefaultIconSet('reicon'),
    provideIcons(icons),
    provideToasts(withToastStackBehavior({})),
    { provide: NOTIFICATION_TOASTS, useClass: MosaikNotificationToasts },
    ...provideAudioServices(),
    {
      provide: RealtimeAudioWorkletModuleLoader,
      useClass: SelfHostedRealtimeAudioWorkletModuleLoader,
    },
    { provide: AUDIO_HOST, useExisting: DesktopAudioHost },
  ],
};
