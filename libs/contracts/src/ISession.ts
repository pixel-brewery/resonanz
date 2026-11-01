// #region Imports
import type { ISessionSummary } from './ISessionSummary.js';
import type { ITranscriptSegment } from './ITranscriptSegment.js';
import type { IQuestionMessage } from './IQuestionMessage.js';
import type { ISessionAnalysis, ISessionMoment } from './ISessionInsight.js';
import type { ISessionPause } from './ISessionPause.js';
// #endregion

/**
 * A complete session exposed through the validated desktop boundary.
 *
 * @public
 */
export interface ISession extends ISessionSummary {
  readonly transcript: readonly ITranscriptSegment[];
  readonly messages: readonly IQuestionMessage[];
  readonly summary: string;
  readonly nextAudioSequence: number;
  readonly audioUrl: string | null;
  readonly error?: string;
  readonly moments?: readonly ISessionMoment[];
  readonly analysis?: ISessionAnalysis;
  readonly pauses?: readonly ISessionPause[];
}
