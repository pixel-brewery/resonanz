/**
 * Lifecycle states exposed by bounded realtime PCM playback.
 *
 * @public
 */
export type PcmAudioStreamPlayerState =
    'idle' | 'starting' | 'ready' | 'buffering' | 'playing' | 'paused' | 'draining' | 'stopping' | 'error' | 'disposed';
