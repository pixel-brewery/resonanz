// #region Imports

import type { IPcmAudioFormat } from './IPcmAudioFormat';

// #endregion

/**
 * Configures realtime PCM frame production from an existing media stream.
 *
 * @public
 */
export interface IPcmAudioCaptureStartOptions {
    /**
     * Target PCM format. Defaults to signed 16-bit little-endian mono audio at 24 kHz.
     *
     * @public
     * @readonly
     */
    readonly format?: IPcmAudioFormat | null;

    /**
     * Requested duration of each emitted frame. Defaults to 20 milliseconds.
     *
     * @public
     * @readonly
     */
    readonly frameDurationMs?: number | null;
}
