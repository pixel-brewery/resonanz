/** Browser storage readiness observed before a long-running audio capture starts. */
export interface IDurableAudioStorageReadiness {
    /** Free quota reported by the browser, or null when the browser does not expose an estimate. */
    readonly availableBytes: number | null;

    /** Whether eviction-resistant storage was granted, or null when the browser does not expose the API. */
    readonly persisted: boolean | null;
}
