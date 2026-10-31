/** One encoded audio fragment durably queued in the current browser profile. */
export interface IDurableAudioChunk {
    /** Encoded audio payload retained until the server acknowledges it. */
    readonly blob: Blob;

    /** Capture time represented by the fragment. */
    readonly capturedAt: Date;

    /** SHA-256 digest used for idempotent server persistence. */
    readonly checksum: string;

    /** MIME type emitted by the browser recorder. */
    readonly contentType: string;

    /** Active recording duration represented by the fragment. */
    readonly durationInMilliseconds: number;

    /** Exact local raw-audio deletion deadline. */
    readonly expiresAt: Date;

    /** Most recent upload failure without server or credential details. */
    readonly lastError: string | null;

    /** Earliest time at which another background upload may start. */
    readonly nextAttemptAt: Date;

    /** Number of failed upload attempts. */
    readonly retryCount: number;

    /** Positive ordering value within the logical recording. */
    readonly sequence: number;

    /** Logical live-session identifier. */
    readonly sessionId: string;

    /** Time at which the fragment was committed to IndexedDB. */
    readonly storedAt: Date;
}
