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
}
