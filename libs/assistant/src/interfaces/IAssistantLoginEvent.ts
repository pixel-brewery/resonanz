// #region Imports

import type { IAssistantLoginInteraction } from './IAssistantLoginInteraction.js';

// #endregion

/**
 * Native authentication lifecycle event without credential values or vendor types.
 *
 * @public
 */
export interface IAssistantLoginEvent {
  /**
   * Resonanz operation ID returned by `startLogin`.
   */
  readonly operationId: string;
  /**
   * Current native lifecycle state.
   */
  readonly state: 'starting' | 'waiting' | 'verifying' | 'succeeded' | 'failed' | 'cancelled';
  /**
   * Present only while a native interaction needs attention.
   */
  readonly interaction?: IAssistantLoginInteraction;
  /**
   * Safe terminal failure explanation, when available.
   */
  readonly message?: string;
  /**
   * Verified account state on successful completion.
   */
  readonly authenticated?: boolean;
}
