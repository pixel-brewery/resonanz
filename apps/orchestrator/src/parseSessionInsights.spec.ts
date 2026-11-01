import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { dataSchemas, type ISession } from '@resonanz/contracts';
import { parseSessionAnalysis, parseSessionAnswer } from './parseSessionInsights.js';

function fixture(): ISession {
  return dataSchemas.session.parse({
    id: randomUUID(),
    title: 'Künstliche Planung',
    kind: 'recording',
    status: 'ready',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    durationMs: 10000,
    mimeType: 'audio/wav',
    audioBytes: 0,
    audioAvailable: false,
    starred: false,
    tags: [],
    collectionId: null,
    transcript: [
      {
        id: 'decision-1',
        speaker: 'participant',
        text: 'Wir liefern am Freitag.',
        startMs: 1000,
        endMs: 3000,
        final: true,
      },
    ],
    messages: [],
    summary: '',
    nextAudioSequence: 1,
    audioUrl: null,
  });
}
describe('transcript evidence admission', () => {
  it('resolves quotes and times from real segment identity, retaining unsupported claims as unverified', () => {
    const session = fixture();
    const answer = parseSessionAnswer(
      JSON.stringify({
        kind: 'evidenced',
        claims: [
          {
            text: 'Lieferung Freitag.',
            segmentIds: ['decision-1', 'decision-1'],
            quote: 'Erfundener Beleg',
            atMs: 9999,
          },
          { text: 'Ein unbekannter Termin.', segmentIds: ['does-not-exist'] },
        ],
      }),
      session,
    )!;
    expect(answer.claims[0]?.evidence).toEqual([
      { segmentId: 'decision-1', atMs: 1000, endMs: 3000, quote: 'Wir liefern am Freitag.' },
    ]);
    expect(answer.claims[1]?.evidence).toEqual([]);
    expect(() =>
      dataSchemas.session.parse({
        ...session,
        messages: [
          {
            id: randomUUID(),
            role: 'assistant',
            text: 'Lieferung Freitag.',
            createdAt: session.createdAt,
            state: 'complete',
            answer,
          },
        ],
      }),
    ).not.toThrow();
  });
  it('does not turn a gap or invalid model output into proven evidence', () => {
    const session = fixture();
    expect(parseSessionAnswer('Dazu habe ich keine Antwort.', session)).toBeUndefined();
    expect(parseSessionAnalysis('{broken JSON', session, 'codex')).toBeUndefined();
    const answer = parseSessionAnswer(
      JSON.stringify({ kind: 'gap', claims: [], relatedSegmentIds: ['decision-1', 'missing'] }),
      session,
    )!;
    expect(answer.kind).toBe('gap');
    expect(answer.claims).toEqual([]);
    expect(answer.related).toHaveLength(1);
  });
  it('admits topic connections only with original transcript evidence and validates them on persistence', () => {
    const session = fixture();
    const analysis = parseSessionAnalysis(
      JSON.stringify({
        summary: [],
        decisions: [],
        tasks: [],
        openQuestions: [],
        chapters: [],
        topics: [
          {
            key: 'release-date',
            title: 'Release date',
            kind: 'decision',
            text: 'Friday.',
            segmentIds: ['decision-1', 'decision-1'],
          },
          {
            key: 'unknown-subject',
            title: 'Unknown',
            kind: 'question',
            text: 'Invented.',
            segmentIds: ['missing'],
          },
        ],
      }),
      session,
      'codex',
    )!;
    expect(analysis.topics).toHaveLength(1);
    expect(analysis.topics?.[0]?.evidence).toEqual([
      { segmentId: 'decision-1', atMs: 1000, endMs: 3000, quote: 'Wir liefern am Freitag.' },
    ]);
    expect(() => dataSchemas.session.parse({ ...session, analysis })).not.toThrow();
    expect(() =>
      dataSchemas.session.parse({
        ...session,
        analysis: {
          ...analysis,
          topics: [
            {
              ...analysis.topics![0],
              evidence: [
                { segmentId: 'decision-1', atMs: 1000, endMs: 3000, quote: 'Forged quote.' },
              ],
            },
          ],
        },
      }),
    ).toThrow(/Evidence/u);
  });
  it('rejects forged persisted references and chapters outside the actual session', () => {
    const session = fixture();
    const analysis = parseSessionAnalysis(
      JSON.stringify({
        summary: [{ text: 'Freitag.', segmentIds: ['decision-1'] }],
        decisions: [],
        tasks: [],
        openQuestions: [],
        chapters: [
          {
            title: 'Lieferung',
            summary: 'Freitag.',
            firstSegmentId: 'decision-1',
            lastSegmentId: 'decision-1',
          },
          { title: 'Erfunden', summary: '', firstSegmentId: 'missing', lastSegmentId: 'missing' },
        ],
      }),
      session,
      'codex',
    )!;
    expect(analysis.chapters).toHaveLength(1);
    expect(() => dataSchemas.session.parse({ ...session, analysis })).not.toThrow();
    expect(() =>
      dataSchemas.session.parse({
        ...session,
        analysis: {
          ...analysis,
          summary: [
            {
              ...analysis.summary[0],
              evidence: [
                { segmentId: 'decision-1', atMs: 1000, endMs: 3000, quote: 'Ganz anderer Text.' },
              ],
            },
          ],
        },
      }),
    ).toThrow(/Evidence/u);
    expect(() =>
      dataSchemas.session.parse({
        ...session,
        analysis: { ...analysis, chapters: [{ ...analysis.chapters[0], endMs: 20000 }] },
      }),
    ).toThrow(/chapter/u);
  });
});
