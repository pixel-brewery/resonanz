// #region Imports

import type { IAssistantInstallation } from './IAssistantInstallation.js';
import type { IAssistantModel } from './IAssistantModel.js';
import type { IAssistantAuthMethod } from './IAssistantAuthMethod.js';

// #endregion

/**
 * Bounded inspection of one isolated account and its available native metadata.
 *
 * @public
 */
export interface IAssistantStatus extends IAssistantInstallation {
  /**
   * Whether the native CLI verified the selected account as authenticated.
   */
  readonly authenticated: boolean;
  /**
   * Safe native display name or account identifier, if available.
   */
  readonly accountLabel?: string;
  /**
   * Actually advertised models; an empty list does not invent a catalog.
   */
  readonly models: readonly IAssistantModel[];
  /**
   * Native login methods supported by the current configuration.
   */
  readonly authMethods: readonly IAssistantAuthMethod[];
  /**
   * Safe explanation when native status or model inspection is unavailable.
   */
  readonly message?: string;
}
