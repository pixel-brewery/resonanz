// #region Imports

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineRealtimeAudioWorkletModuleLoader } from './InlineRealtimeAudioWorkletModuleLoader';

// #endregion

describe('inline realtime audio worklet loading', () => {
    let addModule: ReturnType<typeof vi.fn>;
    let audioContext: AudioContext;
    let createObjectUrl: ReturnType<typeof vi.fn>;
    let revokeObjectUrl: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        addModule = vi.fn().mockResolvedValue(undefined);
        audioContext = {
            audioWorklet: {
                addModule
            }
        } as unknown as AudioContext;
        createObjectUrl = vi.fn(() => 'blob:pcm-worklet');
        revokeObjectUrl = vi.fn();
        Object.defineProperty(globalThis.URL, 'createObjectURL', {
            configurable: true,
            value: createObjectUrl
        });
        Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
            configurable: true,
            value: revokeObjectUrl
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads the bundled processors and revokes the temporary module URL', async () => {
        // arrange
        const loader = new InlineRealtimeAudioWorkletModuleLoader();

        // act
        await loader.load(audioContext);

        // assert
        expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
        expect(addModule).toHaveBeenCalledWith('blob:pcm-worklet');
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:pcm-worklet');
    });

    describe('module registration failures', () => {
        it('revokes the temporary URL when the browser rejects the module', async () => {
            // arrange
            const loader = new InlineRealtimeAudioWorkletModuleLoader();
            addModule.mockRejectedValueOnce(new Error('blocked by policy'));

            // act
            const loadPromise = loader.load(audioContext);

            // assert
            await expect(loadPromise).rejects.toThrow('blocked by policy');
            expect(revokeObjectUrl).toHaveBeenCalledWith('blob:pcm-worklet');
        });
    });
});
