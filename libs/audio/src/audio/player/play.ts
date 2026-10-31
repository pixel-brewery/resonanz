// #region Imports

import { inject } from '@angular/core';
import { AudioPlayer } from './AudioPlayer';
import { IAudioSource } from './IAudioSource';
import { IAudioPlayOptions } from './IAudioPlayOptions';

// #endregion

/**
 * Plays a sound using the injected {@link AudioPlayer}.
 * Can be called in any injection context (e.g., component event handlers).
 *
 * @param src - URL, blob, or externally owned live media stream.
 * @param options - Optional playback options.
 * @public
 */
export function play(src: IAudioSource, options?: IAudioPlayOptions | null): Promise<void> {
    return inject(AudioPlayer).play(src, options ?? null);
}
