// #region Imports

import type { IPcmAudioFormat } from './IPcmAudioFormat';

// #endregion

/**
 * Configures bounded realtime PCM playback.
 *
 * @public
 */
export interface IPcmAudioStreamPlayerStartOptions {
    /**
     * PCM format accepted by the player. Defaults to signed 16-bit little-endian mono audio at 24 kHz.
     *
     * @public
     * @readonly
     */
    readonly format?: IPcmAudioFormat | null;

    /**
     * Audio accumulated before playback begins or resumes after an underrun. Defaults to 60 milliseconds.
     *
     * @public
     * @readonly
     */
    readonly initialBufferDurationMs?: number | null;

    /**
     * Hard queue limit used to bound latency and memory. Defaults to 5 seconds.
     *
     * @public
     * @readonly
     */
    readonly maxBufferDurationMs?: number | null;

    /**
     * Initial output volume in the inclusive range from zero to one.
     *
     * @public
     * @readonly
     */
    readonly volume?: number | null;
}
