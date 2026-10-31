/**
 * Provider-neutral PCM format used by realtime audio capture and playback.
 *
 * @public
 */
export interface IPcmAudioFormat {
    /**
     * Binary sample representation. Realtime PCM currently uses signed 16-bit little-endian samples.
     *
     * @public
     * @readonly
     */
    readonly encoding: 'pcm-s16le';

    /**
     * Number of interleaved audio channels.
     *
     * @public
     * @readonly
     */
    readonly channelCount: number;

    /**
     * Number of samples per channel and second.
     *
     * @public
     * @readonly
     */
    readonly sampleRateHz: number;
}
