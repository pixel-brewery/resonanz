/**
 * Projects the owned recording lifecycle for the shell presenter.
 *
 * @public
 */
export interface IRecordingSnapshot {
  readonly state: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'error' | 'disposed';
  readonly sessionId: string | null;
  readonly durationMs: number;
  readonly pendingBytes: number;
  readonly microphoneLevel: number;
  readonly error: string | null;
}
