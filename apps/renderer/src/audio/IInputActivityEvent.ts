/** One measured PCM frame; atMs belongs to the renderer's monotonic clock. */
export interface IInputActivityEvent {
  readonly sessionId: string;
  readonly atMs: number;
  readonly rms: number;
}
