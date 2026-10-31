// #region Imports

import type { AppEvent } from '@resonanz/contracts';

// #endregion

/**
 * Native speech and local-assistant events relevant to one live audio session.
 *
 * @public
 */
export type AudioHostEvent = Extract<
  AppEvent,
  {
    type:
      | 'speech.result'
      | 'speech.error'
      | 'assistant.text'
      | 'assistant.completed'
      | 'assistant.failed';
  }
>;
