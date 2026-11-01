import { describe, expect, it } from 'vitest';
import type { ITranscriptEntry } from './TranscriptPanelComponent';
import { transcriptSearch } from './transcriptSearch';

const entries: readonly ITranscriptEntry[] = [
  { id: 'before', text: 'The introduction.', startMs: 0, endMs: 1000 },
  { id: 'first-hit', kind: 'speech', text: 'The Export button.', startMs: 1000, endMs: 2000 },
  { id: 'pause', kind: 'pause', text: 'Export pause annotation.', startMs: 2000, endMs: 2000 },
  { id: 'second-hit', text: 'Export the PDF, then export again.', startMs: 2000, endMs: 3000 },
  { id: 'after', text: 'The conclusion.', startMs: 3000, endMs: 4000 },
];

describe('transcriptSearch', () => {
  it('retains every speech and pause context row while counting only matching speech passages once', () => {
    const result = transcriptSearch(entries, ' Export ', true);

    expect(result.entries).toBe(entries);
    expect(result.query).toBe('Export');
    expect(result.matchingIds).toEqual(new Set(['first-hit', 'second-hit']));
    expect(result.matchCount).toBe(2);
    expect(result.entries[2]).toBe(entries[2]);
    expect(result.matchingIds.has('pause')).toBe(false);
  });

  it('preserves the default filtered result and original selection payloads when context mode is not enabled', () => {
    const result = transcriptSearch(entries, 'export');

    expect(result.entries.map((entry) => entry.id)).toEqual(['first-hit', 'second-hit']);
    expect(result.entries[0]).toBe(entries[1]);
    expect(result.entries[1]).toBe(entries[3]);
    expect(result.matchCount).toBe(2);
  });

  it('retains context and exposes zero matches for an absent query, while default filtering remains empty', () => {
    const contextual = transcriptSearch(entries, 'not recorded', true);
    const filtered = transcriptSearch(entries, 'not recorded');

    expect(contextual.entries).toBe(entries);
    expect(contextual.matchCount).toBe(0);
    expect(contextual.matchingIds.size).toBe(0);
    expect(filtered.entries).toEqual([]);
  });

  it.each(['', '   \n  '])(
    'restores all rows without hit styling for an empty query %j',
    (query) => {
      const result = transcriptSearch(entries, query);

      expect(result.entries).toBe(entries);
      expect(result.query).toBe('');
      expect(result.matchCount).toBe(0);
      expect(result.matchingIds.size).toBe(0);
    },
  );

  it('treats regular-expression metacharacters and markup as literal text', () => {
    const literal: readonly ITranscriptEntry[] = [
      { id: 'literal', text: 'A [draft] with .* and <script> text.', startMs: 0, endMs: 1000 },
      { id: 'ordinary', text: 'A draft with ordinary text.', startMs: 1000, endMs: 2000 },
    ];

    for (const query of ['[draft]', '.*', '<script>']) {
      const result = transcriptSearch(literal, query);
      expect(result.entries.map((entry) => entry.id)).toEqual(['literal']);
      expect(result.matchCount).toBe(1);
    }
    expect(transcriptSearch(literal, '[').matchCount).toBe(1);
    expect(transcriptSearch(literal, '^draft$').matchCount).toBe(0);
  });

  it('matches English and German case variants without treating pause labels as spoken content', () => {
    const literal: readonly ITranscriptEntry[] = [
      { id: 'german', text: 'Die Übersetzung bleibt offen.', startMs: 0, endMs: 1000 },
      { id: 'pause', kind: 'pause', text: 'ÜBERSETZUNG', startMs: 1000, endMs: 1000 },
    ];

    expect(transcriptSearch(literal, 'ÜBERSETZUNG', true).matchingIds).toEqual(new Set(['german']));
    expect(transcriptSearch(entries, 'EXPORT', true).matchCount).toBe(2);
  });
});
