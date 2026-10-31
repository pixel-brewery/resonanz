/**
 * Loads the PCM capture and playback processors into one Web Audio context.
 *
 * Consumers may replace this port when a strict content-security policy requires a self-hosted worklet module.
 *
 * @public
 */
export abstract class RealtimeAudioWorkletModuleLoader {
    // #region Fields
    // #endregion

    // #region Ctor
    // #endregion

    // #region Properties
    // #endregion

    // #region Methods

    /**
     * Registers all realtime PCM processors in the supplied context.
     *
     * @param audioContext - Context that will create the worklet nodes.
     * @public
     */
    public abstract load(audioContext: AudioContext): Promise<void>;

    // #endregion
}
