/**
 * Stable failure categories shared by realtime audio input and output.
 *
 * @public
 */
export type RealtimeAudioErrorCode =
    | 'unsupported'
    | 'invalid-state'
    | 'invalid-stream'
    | 'invalid-format'
    | 'out-of-order-frame'
    | 'queue-overflow'
    | 'worklet-load-failed'
    | 'worklet-timeout'
    | 'capture-failed'
    | 'playback-failed';
