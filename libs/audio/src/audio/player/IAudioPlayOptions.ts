/**
 * Optional playback options used when starting audio.
 *
 * @public
 */
export interface IAudioPlayOptions {
    /**
     * Initial volume in the range [0, 1]. Defaults to the current player volume.
     *
     * @public
     * @readonly
     */
    readonly volume?: number | null;

    /**
     * When true, audio loops continuously. Defaults to current loop setting.
     *
     * @public
     * @readonly
     */
    readonly loop?: boolean | null;

    /**
     * Start position for seekable sources in seconds. Live streams ignore this option.
     *
     * @public
     * @readonly
     */
    readonly startAt?: number | null;
}
