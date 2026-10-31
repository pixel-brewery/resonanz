/** Input used to commit one encoded fragment before network upload starts. */
export interface IStoreDurableAudioChunkInput {
    /** Encoded browser audio payload. */
    readonly blob: Blob;

    /** Capture time represented by the fragment. */
    readonly capturedAt: Date;

    /** Lowercase SHA-256 digest of the payload. */
    readonly checksum: string;

    /** Active recording duration represented by the fragment. */
    readonly durationInMilliseconds: number;

    /** Exact local raw-audio deletion deadline. */
    readonly expiresAt: Date;

    /** Positive ordering value within the logical recording. */
    readonly sequence: number;

    /** Logical live-session identifier. */
    readonly sessionId: string;
}
