/**
 * A persisted question or answer belonging to one session.
 *
 * @public
 */
export interface IQuestionMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly createdAt: string;
  readonly runId?: string;
  readonly state: 'complete' | 'streaming' | 'cancelled' | 'error';
}
