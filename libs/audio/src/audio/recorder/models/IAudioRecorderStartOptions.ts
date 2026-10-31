// #region Imports

import type { AudioRecordingRetention } from './AudioRecordingRetention';

// #endregion

/**
 * Configures microphone acquisition and incremental browser recording.
 *
 * @public
 */
export interface IAudioRecorderStartOptions {
    /**
     * Browser audio-track constraints applied during microphone acquisition.
     *
     * @public
     * @readonly
     */
    readonly audioConstraints?: MediaTrackConstraints | null;

    /**
     * Exact microphone device identifier overriding `audioConstraints.deviceId`.
     *
     * @public
     * @readonly
     */
    readonly audioDeviceId?: string | null;

    /**
     * Target encoded audio bitrate in bits per second.
     *
     * @public
     * @readonly
     */
    readonly audioBitsPerSecond?: number | null;

    /**
     * Maximum requested interval between incremental chunks in milliseconds.
     *
     * @public
     * @readonly
     */
    readonly chunkIntervalMs?: number | null;

    /**
     * Ordered MIME type preferences used when the browser supports them.
     *
     * @public
     * @readonly
     */
    readonly preferredMimeTypes?: ReadonlyArray<string> | null;

    /**
     * Determines whether the recorder assembles a final in-memory audio blob.
     *
     * @public
     * @readonly
     */
    readonly retention?: AudioRecordingRetention | null;
}
