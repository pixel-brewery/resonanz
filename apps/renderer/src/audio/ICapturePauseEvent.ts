import type { ISessionPause } from '@resonanz/contracts';

/** An actual media pause observation, kept separate from recognized speech. */
export interface ICapturePauseEvent {
  readonly sessionId: string;
  readonly pause: ISessionPause;
}
