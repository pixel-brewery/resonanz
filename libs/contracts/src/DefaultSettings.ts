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
  locale: 'de-DE',
  conversationInstructions:
    'Du bist Resonanz, ein aufmerksamer Gesprächspartner. Antworte auf Deutsch, klar und natürlich. Gib kurze, gut sprechbare Antworten. Behaupte keine ausgeführten Aktionen, die dir nicht bestätigt wurden.',
} satisfies ISettings);
