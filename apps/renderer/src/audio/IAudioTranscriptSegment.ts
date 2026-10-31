/**
 * Identifies one updatable transcript segment on the logical session timeline.
 *
 * @public
 */
export interface IAudioTranscriptSegment {
  readonly sessionId: string;
  readonly id: string;
  readonly speaker: 'participant' | 'assistant';
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly final: boolean;
}
