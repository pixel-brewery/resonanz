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
  /** Interface language is independent of the conversation/speech locale. */
  readonly uiLanguage?: 'en' | 'de';
  readonly locale: string;
  readonly voice?: string | undefined;
  readonly conversationInstructions: string;
  readonly appearance?: 'system' | 'light' | 'dark';
  readonly userName?: string;
  readonly addressedAs?: string;
  readonly autoAnalyze?: boolean;
  readonly showMiniRecorder?: boolean;
  readonly silenceReminder?: boolean;
  readonly markPausesInTranscript?: boolean;
  /** Normalized output preference; native engines use their own rate scales. */
  readonly speechRate?: number;
  /** Audio-only retention. Missing and 'never' preserve every recording. */
  readonly audioRetentionDays?: 'never' | 30 | 90;
  readonly onboardingComplete?: boolean;
  readonly context?: 'transcript' | 'transcriptAndMoments';
}
