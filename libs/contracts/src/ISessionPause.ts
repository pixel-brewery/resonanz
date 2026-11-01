/** An observed pause at an archive media offset; its excluded wall duration is not speech. */
export interface ISessionPause {
  readonly id: string;
  readonly atMs: number;
  /** Missing when a real pause start was observed but its end was not. */
  readonly durationMs?: number;
}
