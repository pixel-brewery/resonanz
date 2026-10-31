// #region Imports
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { LOCALE_ID, provideZonelessChangeDetection, type ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import {
  provideAppComponent,
  provideDefaultIconSet,
  provideIconSet,
  provideIcons,
  provideTheme,
} from '@pixel-brewery/mosaik-elements-angular';
import { ReiconAliases } from '@pixel-brewery/mosaik-elements-foundation/icons/reicon';
import { SohoTheme } from '@pixel-brewery/mosaik-themes';
import { RealtimeAudioWorkletModuleLoader, provideAudioServices } from '@resonanz/audio';
import { AUDIO_HOST } from '../audio/AUDIO_HOST';
import { SelfHostedRealtimeAudioWorkletModuleLoader } from '../audio/SelfHostedRealtimeAudioWorkletModuleLoader';
import { DesktopAudioHost } from '../services/DesktopAudioHost';
import { icons } from './Icons';
import { shellRoutes } from './ShellRoutes';
// #endregion

registerLocaleData(localeDe);

/** Reuses Symphony's zoneless Angular, Soho theme and icon registration. */
export const shellConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    { provide: LOCALE_ID, useValue: 'de-DE' },
    provideRouter(shellRoutes, withHashLocation()),
    provideTheme({ theme: SohoTheme.SOHO_THEME, mode: 'light' }),
    provideAppComponent({ hasHeader: false, hasNav: false }),
    provideIconSet('reicon', ReiconAliases),
    provideDefaultIconSet('reicon'),
    provideIcons(icons),
    ...provideAudioServices(),
    {
      provide: RealtimeAudioWorkletModuleLoader,
      useClass: SelfHostedRealtimeAudioWorkletModuleLoader,
    },
    { provide: AUDIO_HOST, useExisting: DesktopAudioHost },
  ],
};
