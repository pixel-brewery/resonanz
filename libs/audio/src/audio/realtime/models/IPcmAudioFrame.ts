// #region Imports

import type { IPcmAudioFormat } from './IPcmAudioFormat';

// #endregion

/**
 * One bounded, ordered PCM fragment exchanged with a realtime transport.
 *
 * @public
 */
export interface IPcmAudioFrame {
    /**
     * Interleaved PCM payload.
     *
     * @public
     * @readonly
     */
    readonly data: ArrayBuffer;

    /**
     * Playback or capture duration represented by the payload.
     *
     * @public
     * @readonly
     */
    readonly durationMs: number;

    /**
     * PCM format required to interpret the payload.
     *
     * @public
     * @readonly
     */
    readonly format: IPcmAudioFormat;

    /**
     * Zero-based or transport-assigned ordering value within one audio response.
     *
     * @public
     * @readonly
     */
    readonly sequence: number;

    /**
     * Monotonic frame-start time in milliseconds.
     *
     * @public
     * @readonly
     */
    readonly timestampMs: number;
}
