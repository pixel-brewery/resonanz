// #region Imports
import type { ISettings } from './ISettings.js';
// #endregion

/**
 * Keyless local assistant and system speech defaults.
 *
 * @public
 */
export const defaultSettings: ISettings = Object.freeze({
  assistant: { provider: 'codex' },
  autoTranscribe: true,
  uiLanguage: 'en',
  locale: 'de-DE',
  silenceReminder: false,
  markPausesInTranscript: false,
  speechRate: 1,
  audioRetentionDays: 'never',
  conversationInstructions:
    'You are Resonanz, an attentive conversation partner. Respond clearly and naturally in the language used by the participant. Keep answers short and easy to speak. Do not claim actions that have not been confirmed.',
} satisfies ISettings);
