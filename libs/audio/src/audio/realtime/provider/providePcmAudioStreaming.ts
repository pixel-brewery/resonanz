// #region Imports

import type { Provider } from '@angular/core';
import { PcmAudioCapture } from '../PcmAudioCapture';
import { PcmAudioStreamPlayer } from '../PcmAudioStreamPlayer';
import { InlineRealtimeAudioWorkletModuleLoader } from '../worklets/InlineRealtimeAudioWorkletModuleLoader';
import { RealtimeAudioWorkletModuleLoader } from '../worklets/RealtimeAudioWorkletModuleLoader';

// #endregion

/**
 * Registers transport-neutral realtime PCM capture and streaming playback.
 *
 * Consumers with strict worker content-security policies may override the worklet module loader port.
 *
 * @public
 * @returns Providers for the PCM capture, player, and default worklet loader.
 */
export function providePcmAudioStreaming(): Provider[] {
    return [
        {
            provide: RealtimeAudioWorkletModuleLoader,
            useClass: InlineRealtimeAudioWorkletModuleLoader
        },
        {
            provide: PcmAudioCapture,
            useClass: PcmAudioCapture
        },
        {
            provide: PcmAudioStreamPlayer,
            useClass: PcmAudioStreamPlayer
        }
    ];
}
