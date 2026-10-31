// #region Imports

import type { AudioInputDeviceErrorCode } from './AudioInputDeviceErrorCode';

// #endregion

/**
 * Typed browser audio-input failure with a stable recovery category.
 *
 * @public
 */
export class AudioInputDeviceError extends Error {
    // #region Fields

    public readonly code: AudioInputDeviceErrorCode;
    public override readonly cause: unknown;

    // #endregion

    // #region Ctor

    /**
     * Creates an audio-input error.
     *
     * @param code - Stable recovery category.
     * @param message - Technical error description.
     * @param cause - Original browser failure.
     * @public
     */
    public constructor(code: AudioInputDeviceErrorCode, message: string, cause?: unknown) {
        super(message);

        this.name = 'AudioInputDeviceError';
        this.code = code;
        this.cause = cause;
    }

    // #endregion
}
