/**
 * One attributed, timestamped piece of a session transcript.
 *
 * @public
 */
export interface ITranscriptSegment {
  readonly id: string;
  readonly speaker: 'participant' | 'assistant';
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly final: boolean;
}
