// #region Imports

import type { RealtimeAudioErrorCode } from './RealtimeAudioErrorCode';

// #endregion

/**
 * Typed browser realtime-audio failure suitable for transport-independent recovery decisions.
 *
 * @public
 */
export class RealtimeAudioError extends Error {
    // #region Fields

    private readonly _code: RealtimeAudioErrorCode;

    // #endregion

    // #region Ctor

    /**
     * Creates a realtime-audio error while preserving the original browser failure.
     *
     * @param code - Stable failure category.
     * @param message - Human-readable technical description.
     * @param cause - Original browser failure when available.
     * @public
     */
    public constructor(code: RealtimeAudioErrorCode, message: string, cause?: unknown) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = 'RealtimeAudioError';
        this._code = code;
    }

    // #endregion

    // #region Properties

    /**
     * Stable failure category used by consuming interfaces.
     *
     * @public
     * @readonly
     */
    public get code(): RealtimeAudioErrorCode {
        return this._code;
    }

    // #endregion

    // #region Methods
    // #endregion
}
