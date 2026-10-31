// #region Imports
import type { IAssistantConfiguration } from './IAssistantConfiguration.js';
// #endregion

/**
 * Local assistant and native operating-system speech preferences.
 *
 * @public
 */
export interface ISettings {
  readonly assistant: IAssistantConfiguration;
  readonly autoTranscribe: boolean;
  readonly locale: string;
  readonly voice?: string | undefined;
  readonly conversationInstructions: string;
}
