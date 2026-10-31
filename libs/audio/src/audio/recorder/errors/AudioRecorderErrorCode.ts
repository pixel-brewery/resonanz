/**
 * Stable failure categories exposed by the browser audio recorder.
 *
 * @public
 */
export type AudioRecorderErrorCode =
    | 'unsupported'
    | 'invalid-state'
    | 'permission-denied'
    | 'device-not-found'
    | 'constraints-unsatisfied'
    | 'capture-aborted'
    | 'capture-failed'
    | 'recorder-failed';
