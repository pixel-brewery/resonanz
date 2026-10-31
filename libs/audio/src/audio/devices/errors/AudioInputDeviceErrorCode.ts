/**
 * Stable recovery categories for browser audio-input failures.
 *
 * @public
 */
export type AudioInputDeviceErrorCode =
    | 'analysis-failed'
    | 'capture-failed'
    | 'device-busy'
    | 'device-enumeration-failed'
    | 'device-not-found'
    | 'permission-denied'
    | 'unsupported';
