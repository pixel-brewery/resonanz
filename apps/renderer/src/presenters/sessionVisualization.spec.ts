import { describe, expect, it } from 'vitest';
import { isMyTask, sessionTopicThreads } from './sessionVisualization';
import { dataSchemas, type ISession } from '@resonanz/contracts';

function fixture(id: string, createdAt: string): ISession {
  const timestamp = new Date(createdAt).toISOString();
  return dataSchemas.session.parse({
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: 'Controlled session',
    kind: 'recording',
    status: 'ready',
    durationMs: 10000,
    mimeType: 'audio/wav',
    audioBytes: 0,
    audioAvailable: false,
    starred: false,
    tags: ['onboarding'],
    collectionId: null,
    transcript: [
      {
        id: 'one',
        text: 'Onboarding needs a test.',
        startMs: 1000,
        endMs: 2000,
        final: true,
        speaker: 'participant',
      },
      {
        id: 'two',
        text: 'The onboarding test has an owner.',
        startMs: 4000,
        endMs: 5000,
        final: true,
        speaker: 'participant',
      },
    ],
    messages: [],
    summary: '',
    nextAudioSequence: 1,
    audioUrl: null,
  });
}
describe('session visualization projections', () => {
  it('does not assign tasks through partial-name guesses or an empty profile', () => {
    const claim = { id: 'task', text: 'Prüfen', evidence: [], assignee: 'Mara' };
    expect(isMyTask(claim, '', '')).toBe(false);
    expect(isMyTask(claim, 'Mar', '')).toBe(false);
    expect(isMyTask(claim, 'Mara Lenz', 'Mara, Frau Lenz')).toBe(true);
  });
  it('connects validated topic passages across distinct sessions in instant order, deduplicating shared evidence', () => {
    const later = fixture('11111111-1111-4111-8111-111111111111', '2026-10-30T10:00:00Z');
    const earlier = fixture('22222222-2222-4222-8222-222222222222', '2026-10-28T16:00:00+01:00');
    const attach = (session: ISession): ISession => ({
      ...session,
      analysis: {
        provider: 'codex',
        createdAt: session.createdAt,
        summary: [],
        decisions: [],
        tasks: [],
        openQuestions: [],
        chapters: [],
        topics: session.transcript.map((segment) => ({
          id: segment.id,
          key: 'onboarding',
          title: 'Onboarding',
          text: segment.text,
          kind: 'task',
          evidence: [
            {
              segmentId: segment.id,
              atMs: segment.startMs,
              endMs: segment.endMs,
              quote: segment.text,
            },
          ],
        })),
      },
    });
    const first = attach(earlier);
    const second = attach(later);
    expect(sessionTopicThreads([first])).toEqual([]);
    const threads = sessionTopicThreads([second, first]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.id).toBe('topic:onboarding');
    expect(threads[0]?.points.map((point) => [point.itemId, point.atMs])).toEqual([
      [earlier.id, 1000],
      [earlier.id, 4000],
      [later.id, 1000],
      [later.id, 4000],
    ]);
    const forged = {
      ...second,
      analysis: {
        ...second.analysis!,
        topics: second.analysis!.topics!.map((topic) => ({
          ...topic,
          evidence: topic.evidence.map((item) => ({ ...item, quote: 'Unrelated text.' })),
        })),
      },
    };
    expect(sessionTopicThreads([forged, first])).toEqual([]);
  });
  it('keeps exact shared-tag connections for legacy analyses without claiming inferred topics', () => {
    const first = fixture('11111111-1111-4111-8111-111111111111', '2026-10-30T10:00:00Z');
    const second = fixture('22222222-2222-4222-8222-222222222222', '2026-10-28T16:00:00+01:00');
    expect(sessionTopicThreads([first, second])[0]?.id).toBe('tag:onboarding');
  });
});
