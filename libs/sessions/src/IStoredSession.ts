// #region Imports
import type { ISession, ITranscriptSegment } from '@resonanz/contracts';
// #endregion

/**
 * Private durable wrapper; opaque continuations never enter the renderer contract.
 *
 * @public
 */
export interface IStoredSession {
  readonly version: 1;
  session: ISession;
  continuations: Record<string, string>;
  /** Confirmed native chunks; never included in session projections or exports. */
  transcriptionDraft?: {
    readonly version: 1;
    readonly sourceHash: string;
    readonly locale: string;
    readonly plan: 'pcm16-v1';
    readonly totalChunks: number;
    readonly completedChunks: number;
    readonly generation?: string;
    readonly segments: readonly ITranscriptSegment[];
  };
  /** Private authorization binding and bounded attempt state; never imported or exported. */
  analysisRetry?: {
    readonly id: string;
    readonly binding: string;
    readonly dueAt: string;
    readonly attempt: number;
  };
}
