// #region Imports

import type { AudioRecorderErrorCode } from './AudioRecorderErrorCode';

// #endregion

/**
 * Typed browser audio failure suitable for user-facing recovery decisions.
 *
 * @public
 */
export class AudioRecorderError extends Error {
    // #region Fields

    private readonly _code: AudioRecorderErrorCode;

    // #endregion

    // #region Ctor

    /**
     * Creates an audio recorder error while preserving the original browser failure.
     *
     * @param code - Stable failure category.
     * @param message - Human-readable technical description.
     * @param cause - Original browser failure when available.
     * @public
     */
    public constructor(code: AudioRecorderErrorCode, message: string, cause?: unknown) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = 'AudioRecorderError';
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
    public get code(): AudioRecorderErrorCode {
        return this._code;
    }

    // #endregion

    // #region Methods
    // #endregion
}
