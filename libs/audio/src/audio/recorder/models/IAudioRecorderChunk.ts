/**
 * One ordered audio fragment emitted while recording is still active.
 *
 * @public
 */
export interface IAudioRecorderChunk {
    /**
     * Encoded audio payload for immediate persistence or transport.
     *
     * @public
     * @readonly
     */
    readonly blob: Blob;

    /**
     * Active recording duration when the chunk became available.
     *
     * @public
     * @readonly
     */
    readonly elapsedMs: number;

    /**
     * Effective encoded MIME type of this chunk.
     *
     * @public
     * @readonly
     */
    readonly mimeType: string;

    /**
     * Zero-based sequence number within the current recording.
     *
     * @public
     * @readonly
     */
    readonly sequence: number;

    /**
     * Browser-provided media timecode when available.
     *
     * @public
     * @readonly
     */
    readonly timecodeMs: number | null;
}
