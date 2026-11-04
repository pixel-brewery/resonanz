import type { ISessionSummary } from '@resonanz/contracts';
import type { TranslationKey } from '@resonanz/intl';

/** A durable processing activity that remains visible outside the capture panel. */
export interface ISessionProcessingActivity {
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly stage: 'transcription' | 'analysis';
  readonly state: 'running' | 'failed';
  readonly label: TranslationKey;
  readonly description: TranslationKey;
  readonly audioAvailable: boolean;
  readonly progress?: number;
  readonly error?: string;
}

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

/** Projects the current stored stage without relying on an open screen or local request. */
export function sessionProcessingActivity(
  session: ISessionSummary | null | undefined,
): ISessionProcessingActivity | null {
  if (!session || session.status === 'recording' || session.status === 'paused') return null;
  for (const state of ['running', 'failed'] as const) {
    for (const stage of ['transcription', 'analysis'] as const) {
      const step = session.pipeline?.[stage];
      if (step?.state !== state) continue;
      return {
        sessionId: session.id,
        sessionTitle: session.title,
        stage,
        state,
        label:
          stage === 'transcription'
            ? state === 'running'
              ? 'loc.resonanz.pipeline.transcriptionRunning'
              : 'loc.resonanz.processing.transcriptionFailed'
            : state === 'running'
              ? 'loc.resonanz.pipeline.analysisRunning'
              : 'loc.resonanz.processing.analysisFailed',
        description:
          stage === 'transcription'
            ? state === 'running'
              ? 'loc.resonanz.processing.transcriptionDescription'
              : 'loc.resonanz.processing.transcriptionFailedDescription'
            : state === 'running'
              ? 'loc.resonanz.processing.analysisDescription'
              : 'loc.resonanz.processing.analysisFailedDescription',
        audioAvailable: session.audioAvailable,
        ...(step.progress === undefined ? {} : { progress: step.progress }),
        ...(step.error ? { error: step.error } : {}),
      };
    }
  }
  return null;
}

/** Prioritizes work that is still running while retaining sessions that need attention. */
export function sessionProcessingActivities(
  sessions: readonly ISessionSummary[],
): readonly ISessionProcessingActivity[] {
  return sessions
    .flatMap((session) => {
      const activity = sessionProcessingActivity(session);
      return activity ? [activity] : [];
    })
    .sort((left, right) => Number(left.state === 'failed') - Number(right.state === 'failed'));
}
