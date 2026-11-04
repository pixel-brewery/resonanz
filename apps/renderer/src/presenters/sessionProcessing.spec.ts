import { describe, expect, it } from 'vitest';
import type { ISessionSummary } from '@resonanz/contracts';
import {
  sessionDisplayState,
  isSessionProcessing,
  needsSessionAttention,
  sessionProcessingActivity,
  sessionProcessingActivities,
} from './sessionProcessing';
const session: ISessionSummary = {
  id: 'sample',
  title: 'Sample',
  kind: 'recording',
  status: 'ready',
  createdAt: '2026-10-31T10:00:00Z',
  updatedAt: '2026-10-31T10:00:00Z',
  durationMs: 1000,
  mimeType: 'audio/wav',
  audioBytes: 44,
  audioAvailable: true,
  starred: false,
  tags: [],
  collectionId: null,
  transcriptAvailable: true,
};
describe('processing projections', () => {
  it('keeps transcription failure distinct from an unavailable assistant and ignores unrelated question processing', () => {
    expect(
      sessionDisplayState({ ...session, pipeline: { transcription: { state: 'failed' } } }),
    ).toBe('error');
    expect(sessionDisplayState({ ...session, pipeline: { analysis: { state: 'failed' } } })).toBe(
      'analysisWaiting',
    );
    expect(
      sessionDisplayState({
        ...session,
        pipeline: { transcription: { state: 'running', progress: 64 } },
      }),
    ).toBe('transcribing');
    expect(
      sessionDisplayState({
        ...session,
        status: 'processing',
        pipeline: { analysis: { state: 'done' } },
      }),
    ).toBe('busy');
    expect(
      sessionDisplayState({
        ...session,
        status: 'recording',
        pipeline: { analysis: { state: 'running' } },
      }),
    ).toBe('recording');
    expect(needsSessionAttention('analysisWaiting')).toBe(true);
    expect(isSessionProcessing('transcribing')).toBe(true);
    expect(isSessionProcessing('ready')).toBe(false);
  });

  it('keeps durable transcription activity visible when no local request is attached and never invents progress', () => {
    const activity = sessionProcessingActivity({
      ...session,
      transcriptAvailable: false,
      pipeline: { transcription: { state: 'running' } },
    });

    expect(activity).toMatchObject({
      sessionId: session.id,
      sessionTitle: session.title,
      stage: 'transcription',
      state: 'running',
      label: 'loc.resonanz.pipeline.transcriptionRunning',
      audioAvailable: true,
    });
    expect(activity).not.toHaveProperty('progress');
    expect(
      sessionProcessingActivity({
        ...session,
        pipeline: { transcription: { state: 'running', progress: 0 } },
      }),
    ).toHaveProperty('progress', 0);
  });

  it('retains a failed stage with readable context and original diagnostics until it is retried or completed', () => {
    const failed = {
      ...session,
      pipeline: {
        transcription: { state: 'failed' as const, error: 'System recognition interrupted' },
      },
    };

    expect(sessionProcessingActivity(failed)).toMatchObject({
      stage: 'transcription',
      state: 'failed',
      label: 'loc.resonanz.processing.transcriptionFailed',
      description: 'loc.resonanz.processing.transcriptionFailedDescription',
      error: 'System recognition interrupted',
    });
    expect(
      sessionProcessingActivity({
        ...failed,
        pipeline: { transcription: { state: 'running', progress: 42 } },
      }),
    ).toMatchObject({ state: 'running', progress: 42 });
    expect(
      sessionProcessingActivity({ ...failed, pipeline: { transcription: { state: 'done' } } }),
    ).toBeNull();
  });

  it('prioritizes running work across sessions and preserves analysis failures as a separate stage', () => {
    const sessions = [
      { ...session, id: 'failed', pipeline: { analysis: { state: 'failed' as const } } },
      { ...session, id: 'finished', pipeline: { transcription: { state: 'done' as const } } },
      {
        ...session,
        id: 'running',
        pipeline: { transcription: { state: 'running' as const, progress: 64 } },
      },
    ];

    expect(
      sessionProcessingActivities(sessions).map(({ sessionId, stage, state }) => ({
        sessionId,
        stage,
        state,
      })),
    ).toEqual([
      { sessionId: 'running', stage: 'transcription', state: 'running' },
      { sessionId: 'failed', stage: 'analysis', state: 'failed' },
    ]);
    expect(sessions.map(({ id }) => id)).toEqual(['failed', 'finished', 'running']);
  });

  it('does not present a stale pipeline as a second operation while capture owns the session', () => {
    for (const status of ['recording', 'paused'] as const)
      expect(
        sessionProcessingActivity({
          ...session,
          status,
          pipeline: { transcription: { state: 'running' } },
        }),
      ).toBeNull();
    expect(sessionProcessingActivity(null)).toBeNull();
    expect(sessionProcessingActivity({ ...session, status: 'processing' })).toBeNull();
  });
});
