/**
 * Operating-system identity used to avoid signalling a reused unrelated PID.
 *
 * @public
 */
export interface IProcessIdentity {
  readonly pid: number;
  readonly parentPid: number;
  readonly groupId: number;
  readonly startedAt: string;
}
