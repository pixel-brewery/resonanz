// #region Imports

import type { AiDriverBase } from '@pixel-brewery/synapse-core';
import type { ProcessRunnerBase } from '@pixel-brewery/synapse-runtime';
import type { AssistantProvider } from '../models/AssistantProvider.js';

// #endregion

/**
 * Explicit native boundary substitutions for deterministic, account-free verification.
 *
 * @public
 */
export interface IAssistantServiceDependencies {
  /**
   * Optional injected native process runner; ownership transfers to the service.
   */
  readonly runner?: ProcessRunnerBase;
  /**
   * Optional injected drivers with supported product identifiers; service owns their lifecycle.
   */
  readonly drivers?: readonly AiDriverBase[];
  /**
   * Optional filesystem-discovery substitution; never invokes inference or native login.
   */
  readonly resolveExecutable?: (
    provider: AssistantProvider,
    environment: Readonly<Record<string, string | undefined>>,
  ) => string | undefined;
}
