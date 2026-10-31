// #region Imports

import type { Provider } from '@angular/core';
import { AudioPlayer } from '../AudioPlayer';

// #endregion

/**
 * Registers the {@link AudioPlayer} for DI.
 *
 * @public
 */
export function provideAudioPlayer(): Provider[] {
    return [
        {
            provide: AudioPlayer,
            useClass: AudioPlayer
        }
    ];
}
