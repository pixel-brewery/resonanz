/**
 * Describes the audio source input for the player.
 *
 * @public
 */
export interface IAudioSource {
    /**
     * URL, retained blob, or externally owned live media stream.
     *
     * @public
     * @readonly
     */
    readonly src: string | Blob | MediaStream;

    /**
     * Optional, friendly name for diagnostics and logging.
     *
     * @public
     * @readonly
     */
    readonly label?: string | null;
}
