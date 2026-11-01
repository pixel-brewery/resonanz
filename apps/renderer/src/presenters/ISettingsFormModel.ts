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
  uiLanguage: 'en' | 'de';
  locale: string;
  autoTranscribe: boolean;
  voice: string;
  conversationInstructions: string;
  appearance: 'system' | 'light' | 'dark';
  userName: string;
  addressedAs: string;
  autoAnalyze: boolean;
  showMiniRecorder: boolean;
  silenceReminder: boolean;
  markPausesInTranscript: boolean;
  speechRate: number;
  audioRetentionDays: 'never' | '30' | '90';
  context: 'transcript' | 'transcriptAndMoments';
}
