// #region Imports

import { InjectionToken } from '@angular/core';
import type { IAudioHost } from './IAudioHost';

// #endregion

/**
 * Connects sandboxed audio coordination to the application-owned desktop API.
 *
 * @public
 */
export const AUDIO_HOST = new InjectionToken<IAudioHost>('RESONANZ_AUDIO_HOST');
