// #region Imports

import type { IAssistantAuthField } from './IAssistantAuthField.js';

// #endregion

/**
 * Safe, expiring native login instructions addressed to the active settings flow.
 *
 * @public
 */
export interface IAssistantLoginInteraction {
  /**
   * Current interaction identifier required when submitting a response.
   */
  readonly id: string;
  /**
   * Native interaction discriminator.
   */
  readonly type: string;
  /**
   * Absolute UTC epoch milliseconds after which the interaction expires.
   */
  readonly expiresAt: number;
  /**
   * Safe user instruction, when supplied.
   */
  readonly message?: string;
  /**
   * Native sign-in URL, opened only after an explicit user action.
   */
  readonly url?: string;
  /**
   * Device verification code for this interaction only.
   */
  readonly code?: string;
  /**
   * Inputs actually requested by the native procedure.
   */
  readonly fields?: readonly IAssistantAuthField[];
}
