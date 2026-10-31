// #region Imports

import { PCM_AUDIO_WORKLET_DEFINITION } from './PcmAudioWorkletDefinition';
import { RealtimeAudioWorkletModuleLoader } from './RealtimeAudioWorkletModuleLoader';

// #endregion

/**
 * Loads the bundled PCM processors from a short-lived object URL.
 *
 * @public
 */
export class InlineRealtimeAudioWorkletModuleLoader extends RealtimeAudioWorkletModuleLoader {
    // #region Fields
    // #endregion

    // #region Ctor
    // #endregion

    // #region Properties
    // #endregion

    // #region Methods

    /**
     * Registers the bundled processors and immediately revokes their temporary URL.
     *
     * @param audioContext - Context that will create the worklet nodes.
     * @public
     */
    public override async load(audioContext: AudioContext): Promise<void> {
        if (!audioContext.audioWorklet?.addModule || !globalThis.URL?.createObjectURL) {
            throw new Error('AudioWorklet module loading is unavailable.');
        }

        const moduleBlob = new Blob([PCM_AUDIO_WORKLET_DEFINITION.source], { type: 'text/javascript' });
        const moduleUrl = globalThis.URL.createObjectURL(moduleBlob);

        try {
            await audioContext.audioWorklet.addModule(moduleUrl);
        } finally {
            globalThis.URL.revokeObjectURL(moduleUrl);
        }
    }

    // #endregion
}
