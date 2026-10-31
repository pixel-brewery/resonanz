// #region Imports

import type { AssistantProvider } from '../models/AssistantProvider.js';

// #endregion

/**
 * Explicit native assistant/account/model selection, without credential values.
 *
 * @public
 */
export interface IAssistantConfiguration {
  /**
   * Installed native assistant selected by the user.
   */
  readonly provider: AssistantProvider;
  /**
   * Stable application-owned account name; defaults to `default`.
   */
  readonly accountId?: string;
  /**
   * Optional absolute path selected by the host for an installed executable.
   */
  readonly executable?: string;
  /**
   * Optional native model identifier; omission preserves the CLI default.
   */
  readonly model?: string;
  /**
   * OpenCode's exact native provider ID; inferred from a selected provider/model when omitted.
   */
  readonly nativeProviderId?: string;
  /**
   * OpenCode's exact advertised native authentication method label.
   */
  readonly nativeAuthMethod?: string;
}
