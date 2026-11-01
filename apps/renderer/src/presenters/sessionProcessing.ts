import type { ISessionSummary } from '@resonanz/contracts';
export type SessionDisplayState =
  | 'recording'
  | 'paused'
  | 'transcribing'
  | 'analyzing'
  | 'analysisWaiting'
  | 'busy'
  | 'ready'
  | 'saved'
  | 'error'
  | 'interrupted';
/** Stored stage state is more precise than the coarse session lifecycle. */
export function sessionDisplayState(session: ISessionSummary): SessionDisplayState {
  if (session.status === 'recording' || session.status === 'paused') return session.status;
  if (session.pipeline?.transcription?.state === 'failed') return 'error';
  if (session.pipeline?.transcription?.state === 'running') return 'transcribing';
  if (session.pipeline?.analysis?.state === 'running') return 'analyzing';
  if (session.pipeline?.analysis?.state === 'failed') return 'analysisWaiting';
  if (session.status === 'error' || session.status === 'interrupted') return session.status;
  if (session.status === 'processing') return 'busy';
  return session.transcriptAvailable || session.pipeline?.transcription?.state === 'done'
    ? 'ready'
    : 'saved';
}
export function isSessionProcessing(state: SessionDisplayState): boolean {
  return state === 'transcribing' || state === 'analyzing' || state === 'busy';
}
export function needsSessionAttention(state: SessionDisplayState): boolean {
  return state === 'error' || state === 'interrupted' || state === 'analysisWaiting';
}
