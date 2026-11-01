import { describe, expect, it } from 'vitest';
import type { ISession } from '@resonanz/contracts';
import { sessionDeletionDetails } from './sessionDeletionDetails';

function fixture(): ISession {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Controlled deletion review',
    kind: 'recording',
    status: 'ready',
    createdAt: '2026-10-31T10:00:00.000Z',
    updatedAt: '2026-10-31T10:00:00.000Z',
    durationMs: 1000,
    mimeType: 'audio/wav',
    audioBytes: 0,
    audioAvailable: false,
    audioUrl: null,
    starred: false,
    tags: [],
    collectionId: null,
    transcript: [],
    messages: [],
    summary: '',
    nextAudioSequence: 1,
  };
}

describe('sessionDeletionDetails', () => {
  it('keeps absent details distinct from a known empty session', () => {
    expect(sessionDeletionDetails(null)).toBeNull();
    expect(sessionDeletionDetails(fixture())).toEqual({
      transcriptState: 'empty',
      wordCount: 0,
      analysisAvailable: false,
      questionCount: 0,
      markerCount: 0,
    });
  });

  it('counts stored words, user questions and user markers without counting answers or pause duration as content', () => {
    const session = fixture();
    const createdAt = session.createdAt;
    expect(
      sessionDeletionDetails({
        ...session,
        transcript: [
          {
            id: 'first',
            speaker: 'participant',
            startMs: 0,
            endMs: 400,
            text: ' One  two\nthree ',
            final: true,
          },
          {
            id: 'second',
            speaker: 'assistant',
            startMs: 500,
            endMs: 900,
            text: 'Four five.',
            final: true,
          },
        ],
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user',
            state: 'complete',
            createdAt,
            text: 'Question?',
          },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            state: 'complete',
            createdAt,
            text: 'Answer.',
          },
          {
            id: crypto.randomUUID(),
            role: 'user',
            state: 'complete',
            createdAt,
            text: 'Unanswered?',
          },
        ],
        moments: [
          { id: crypto.randomUUID(), kind: 'decision', atMs: 100, origin: 'capture' },
          { id: crypto.randomUUID(), kind: 'question', atMs: 500, origin: 'note' },
        ],
        pauses: [{ id: crypto.randomUUID(), atMs: 400, durationMs: 60_000 }],
        summary: 'A stored legacy analysis.',
        pipeline: { transcription: { state: 'done' } },
      }),
    ).toEqual({
      transcriptState: 'ready',
      wordCount: 5,
      analysisAvailable: true,
      questionCount: 2,
      markerCount: 2,
    });
  });

  it.each(['failed', 'running'] as const)(
    'labels a %s transcript partial even when its saved segments are final',
    (state) => {
      const session = fixture();
      const result = sessionDeletionDetails({
        ...session,
        transcript: [
          {
            id: 'first',
            speaker: 'participant',
            startMs: 0,
            endMs: 1000,
            text: 'Some stored words.',
            final: true,
          },
        ],
        pipeline: { transcription: { state } },
      });
      expect(result?.transcriptState).toBe('partial');
      expect(result?.wordCount).toBe(3);
    },
  );

  it('does not infer complete coverage from legacy final segments and retains an analysis artifact with no claims', () => {
    const session = fixture();
    const result = sessionDeletionDetails({
      ...session,
      transcript: [
        {
          id: 'first',
          speaker: 'participant',
          startMs: 0,
          endMs: 1000,
          text: 'Legacy stored words.',
          final: true,
        },
      ],
      analysis: {
        provider: 'codex',
        createdAt: session.createdAt,
        summary: [],
        decisions: [],
        tasks: [],
        openQuestions: [],
        chapters: [],
      },
    });
    expect(result?.transcriptState).toBe('unknown');
    expect(result?.analysisAvailable).toBe(true);
    expect(result?.questionCount).toBe(0);
  });

  it('does not label interrupted or unfinished speech as a complete transcript', () => {
    const session = fixture();
    const transcript = [
      {
        id: 'first',
        speaker: 'participant' as const,
        startMs: 0,
        endMs: 1000,
        text: 'Stored words.',
        final: true,
      },
    ];
    expect(
      sessionDeletionDetails({ ...session, status: 'interrupted', transcript })?.transcriptState,
    ).toBe('partial');
    expect(
      sessionDeletionDetails({
        ...session,
        transcript: [{ ...transcript[0]!, final: false }],
        pipeline: { transcription: { state: 'done' } },
      })?.transcriptState,
    ).toBe('partial');
  });
});
