import { describe, expect, it } from 'vitest';
import type { ISessionSummary } from '@resonanz/contracts';
import {
  sessionDisplayState,
  isSessionProcessing,
  needsSessionAttention,
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
});
