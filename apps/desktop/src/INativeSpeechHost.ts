// #region Imports
import type { SpeechSession } from 'electron-native-speech';
import type { AppEvent, ISession, ISettings, ITranscriptSegment } from '@resonanz/contracts';
// #endregion

/** Host-owned persistence, resources and UI event ports for system speech. */
export interface INativeSpeechHost {
  readonly dataDirectory: string;
  readonly windowsScript: string;
  readonly session: (id: string) => Promise<ISession>;
  readonly settings: () => Promise<ISettings>;
  readonly persist: (sessionId: string, segment: ITranscriptSegment) => Promise<void>;
  readonly publish: (event: AppEvent) => void;
  readonly createSession?: () => Promise<SpeechSession>;
}
