// #region Imports
import type { ISession } from '@resonanz/contracts';
// #endregion

/**
 * Private durable wrapper; opaque continuations never enter the renderer contract.
 *
 * @public
 */
export interface IStoredSession {
  readonly version: 1;
  session: ISession;
  continuations: Record<string, string>;
  /** Private authorization binding and bounded attempt state; never imported or exported. */
  analysisRetry?: {
    readonly id: string;
    readonly binding: string;
    readonly dueAt: string;
    readonly attempt: number;
  };
}
