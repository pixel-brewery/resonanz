// #region Imports
import type { ISettings } from '@resonanz/contracts';
// #endregion

/** Editable account and native speech choices stay separate from verified capabilities. */
export interface ISettingsFormModel {
  provider: ISettings['assistant']['provider'];
  accountId: string;
  executable: string;
  model: string;
  nativeProviderId: string;
  nativeAuthMethod: string;
  locale: string;
  autoTranscribe: boolean;
  voice: string;
  conversationInstructions: string;
}
