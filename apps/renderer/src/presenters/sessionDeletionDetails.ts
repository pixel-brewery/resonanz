import type { ISession } from '@resonanz/contracts';
import type { IDeleteSessionDetails } from '../components/delete-dialog/IDeleteSessionDetails';

/** Projects only stored content and observed completion state for the deletion review. */
export function sessionDeletionDetails(session: ISession | null): IDeleteSessionDetails | null {
  if (!session) return null;
  const wordCount = session.transcript.reduce(
    (count, segment) => count + segment.text.split(/\s+/u).filter(Boolean).length,
    0,
  );
  const state = session.pipeline?.transcription?.state;
  const incomplete =
    state === 'failed' ||
    state === 'running' ||
    ['recording', 'paused', 'interrupted'].includes(session.status) ||
    session.transcript.some((segment) => !segment.final);
  return {
    transcriptState: !wordCount
      ? 'empty'
      : incomplete
        ? 'partial'
        : state === 'done'
          ? 'ready'
          : 'unknown',
    wordCount,
    analysisAvailable: !!session.analysis || !!session.summary.trim(),
    questionCount: session.messages.filter((message) => message.role === 'user').length,
    markerCount: session.moments?.length ?? 0,
  };
}
