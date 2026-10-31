// #region Imports

import type { AssistantProvider } from '../models/AssistantProvider.js';

// #endregion

/**
 * Filesystem-only native executable discovery; no login or inference is initiated.
 *
 * @public
 */
export interface IAssistantInstallation {
  /**
   * Supported assistant identifier.
   */
  readonly provider: AssistantProvider;
  /**
   * Whether an executable was found in the host's approved search paths.
   */
  readonly installed: boolean;
  /**
   * Absolute executable path when available.
   */
  readonly executable?: string;
}
