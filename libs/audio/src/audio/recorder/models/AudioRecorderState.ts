/**
 * Lifecycle states of a browser audio recording session.
 *
 * @public
 */
export type AudioRecorderState = 'idle' | 'acquiring' | 'recording' | 'paused' | 'stopping' | 'error' | 'disposed';
