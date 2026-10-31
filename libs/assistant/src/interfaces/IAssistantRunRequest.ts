// #region Imports

import type { IAssistantConfiguration } from './IAssistantConfiguration.js';

// #endregion

/**
 * Host-composed session analysis, question or live-conversation text turn.
 *
 * @public
 */
export interface IAssistantRunRequest {
  /**
   * Unique host correlation ID, also used for cancellation.
   */
  readonly runId: string;
  /**
   * Recording session owning the private non-Git execution workspace.
   */
  readonly sessionId: string;
  /**
   * Host-owned prompt containing the intentionally supplied session context.
   */
  readonly prompt: string;
  /**
   * Explicit account and model selection.
   */
  readonly configuration: IAssistantConfiguration;
  /**
   * Opaque, complete Synapse continuation from a prior successful turn.
   */
  readonly continuation?: string;
}
