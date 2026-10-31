// #region Imports

import { describe, expect, it } from 'vitest';
import { PcmAudioFormatPolicy } from './PcmAudioFormatPolicy';

// #endregion

describe('realtime PCM format policy', () => {
    it('provides an immutable provider-neutral speech default', () => {
        // arrange

        // act
        const format = PcmAudioFormatPolicy.normalize();

        // assert
        expect(format).toEqual({
            channelCount: 1,
            encoding: 'pcm-s16le',
            sampleRateHz: 24_000
        });
        expect(Object.isFrozen(format)).toBe(true);
    });

    it('calculates duration from interleaved stereo samples', () => {
        // arrange
        const format = {
            channelCount: 2,
            encoding: 'pcm-s16le',
            sampleRateHz: 48_000
        } as const;

        // act
        const durationMs = PcmAudioFormatPolicy.calculateDurationMs(48_000 * 2 * 2, format);

        // assert
        expect(durationMs).toBe(1_000);
    });

    describe('invalid formats and payloads', () => {
        it('rejects unsupported channel counts', () => {
            // arrange
            const format = {
                channelCount: 3,
                encoding: 'pcm-s16le',
                sampleRateHz: 24_000
            } as const;

            // act
            const normalize = (): Readonly<unknown> => PcmAudioFormatPolicy.normalize(format);

            // assert
            expect(normalize).toThrow('channelCount');
        });

        it('rejects payloads that split an interleaved sample frame', () => {
            // arrange
            const format = {
                channelCount: 2,
                encoding: 'pcm-s16le',
                sampleRateHz: 24_000
            } as const;

            // act
            const calculate = (): number => PcmAudioFormatPolicy.calculateSampleCount(6, format);

            // assert
            expect(calculate).toThrow('multiple of 4');
        });
    });
});
