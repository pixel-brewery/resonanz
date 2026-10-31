// #region Imports

import type { IPcmAudioFormat } from './models/IPcmAudioFormat';

// #endregion

/**
 * Validates and derives values from the stable realtime PCM format contract.
 *
 * @public
 */
export class PcmAudioFormatPolicy {
    // #region Fields

    /**
     * Default format accepted by provider-neutral realtime speech integrations.
     *
     * @public
     * @readonly
     */
    public static readonly Default: Readonly<IPcmAudioFormat> = Object.freeze({
        channelCount: 1,
        encoding: 'pcm-s16le',
        sampleRateHz: 24_000
    });

    private static readonly _BYTES_PER_SAMPLE = 2;
    private static readonly _MAX_CHANNEL_COUNT = 2;
    private static readonly _MAX_SAMPLE_RATE_HZ = 96_000;
    private static readonly _MIN_CHANNEL_COUNT = 1;
    private static readonly _MIN_SAMPLE_RATE_HZ = 8_000;

    // #endregion

    // #region Ctor

    private constructor() {
        throw new Error('PcmAudioFormatPolicy is a static policy and cannot be instantiated.');
    }

    // #endregion

    // #region Properties
    // #endregion

    // #region Methods

    /**
     * Calculates the payload duration for a validated format.
     *
     * @param byteLength - PCM payload size in bytes.
     * @param format - PCM format used by the payload.
     * @public
     * @returns Payload duration in milliseconds.
     */
    public static calculateDurationMs(byteLength: number, format: IPcmAudioFormat): number {
        const sampleCount = PcmAudioFormatPolicy.calculateSampleCount(byteLength, format);

        return (sampleCount / format.sampleRateHz) * 1_000;
    }

    /**
     * Calculates the samples per channel represented by an interleaved payload.
     *
     * @param byteLength - PCM payload size in bytes.
     * @param format - PCM format used by the payload.
     * @public
     * @returns Number of samples per channel.
     */
    public static calculateSampleCount(byteLength: number, format: IPcmAudioFormat): number {
        PcmAudioFormatPolicy.validate(format);

        const bytesPerFrame = PcmAudioFormatPolicy._BYTES_PER_SAMPLE * format.channelCount;

        if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength % bytesPerFrame !== 0) {
            throw new RangeError(`PCM payload size must be a positive multiple of ${bytesPerFrame} bytes.`);
        }

        return byteLength / bytesPerFrame;
    }

    /**
     * Compares two PCM format contracts by value.
     *
     * @param left - First format.
     * @param right - Second format.
     * @public
     * @returns True when both formats describe identical samples.
     */
    public static equals(left: IPcmAudioFormat, right: IPcmAudioFormat): boolean {
        return (
            left.encoding === right.encoding &&
            left.channelCount === right.channelCount &&
            left.sampleRateHz === right.sampleRateHz
        );
    }

    /**
     * Creates an immutable validated format, applying the realtime speech default when omitted.
     *
     * @param format - Caller-provided PCM format.
     * @public
     * @returns Immutable normalized PCM format.
     */
    public static normalize(format?: IPcmAudioFormat | null): Readonly<IPcmAudioFormat> {
        const normalizedFormat: IPcmAudioFormat = {
            channelCount: format?.channelCount ?? PcmAudioFormatPolicy.Default.channelCount,
            encoding: format?.encoding ?? PcmAudioFormatPolicy.Default.encoding,
            sampleRateHz: format?.sampleRateHz ?? PcmAudioFormatPolicy.Default.sampleRateHz
        };

        PcmAudioFormatPolicy.validate(normalizedFormat);

        return Object.freeze(normalizedFormat);
    }

    /**
     * Rejects formats that cannot be represented by the current PCM worklet implementation.
     *
     * @param format - PCM format to validate.
     * @public
     */
    public static validate(format: IPcmAudioFormat): void {
        if (format.encoding !== 'pcm-s16le') {
            throw new RangeError('PCM encoding must be pcm-s16le.');
        }

        if (
            !Number.isSafeInteger(format.channelCount) ||
            format.channelCount < PcmAudioFormatPolicy._MIN_CHANNEL_COUNT ||
            format.channelCount > PcmAudioFormatPolicy._MAX_CHANNEL_COUNT
        ) {
            throw new RangeError('PCM channelCount must be either 1 or 2.');
        }

        if (
            !Number.isSafeInteger(format.sampleRateHz) ||
            format.sampleRateHz < PcmAudioFormatPolicy._MIN_SAMPLE_RATE_HZ ||
            format.sampleRateHz > PcmAudioFormatPolicy._MAX_SAMPLE_RATE_HZ
        ) {
            throw new RangeError('PCM sampleRateHz must be an integer between 8000 and 96000.');
        }
    }

    // #endregion
}
