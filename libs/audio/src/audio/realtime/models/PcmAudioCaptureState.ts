/**
 * Lifecycle states exposed by realtime PCM capture.
 *
 * @public
 */
export type PcmAudioCaptureState = 'idle' | 'starting' | 'capturing' | 'paused' | 'stopping' | 'error' | 'disposed';
