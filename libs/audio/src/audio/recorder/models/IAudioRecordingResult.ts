// #region Imports

import type { AudioRecordingRetention } from './AudioRecordingRetention';

// #endregion

/**
 * Metadata produced when an audio recording ends successfully.
 *
 * @public
 */
export interface IAudioRecordingResult {
    /**
     * Complete audio payload when memory retention was enabled.
     *
     * @public
     * @readonly
     */
    readonly blob: Blob | null;

    /**
     * Number of non-empty chunks emitted during the recording.
     *
     * @public
     * @readonly
     */
    readonly chunkCount: number;

    /**
     * Active recording duration excluding paused intervals.
     *
     * @public
     * @readonly
     */
    readonly durationMs: number;

    /**
     * Effective encoded MIME type of the recording.
     *
     * @public
     * @readonly
     */
    readonly mimeType: string;

    /**
     * Retention strategy used for the recording.
     *
     * @public
     * @readonly
     */
    readonly retention: AudioRecordingRetention;
}
