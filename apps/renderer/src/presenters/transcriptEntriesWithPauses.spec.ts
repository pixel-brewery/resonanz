import { describe, expect, it } from 'vitest';
import { transcriptEntriesWithPauses } from './transcriptEntriesWithPauses';

describe('transcriptEntriesWithPauses', () => {
  it('interleaves explicitly nonspeech rows without changing transcript IDs, text or audio bounds', () => {
    const speech = [{ id: 'source', text: 'Original words', startMs: 1000, endMs: 2000 }];
    const rows = transcriptEntriesWithPauses(
      speech,
      [{ id: 'source', atMs: 1000, durationMs: 180000 }],
      (duration) => `Pause ${duration}`,
    );
    expect(rows[0]).toEqual({
      id: 'pause-source',
      kind: 'pause',
      text: 'Pause 180000',
      startMs: 1000,
      endMs: 1000,
    });
    expect(rows[1]).toBe(speech[0]);
    expect(rows.filter((row) => row.kind !== 'pause').map((row) => row.text)).toEqual([
      'Original words',
    ]);
    expect(rows[0]).not.toHaveProperty('evidence');
  });
  it('preserves an unobserved end instead of calculating duration from later transcript or session time', () => {
    const durations: (number | undefined)[] = [];
    const rows = transcriptEntriesWithPauses([], [{ id: 'open', atMs: 45000 }], (duration) => {
      durations.push(duration);
      return 'End not observed';
    });
    expect(durations).toEqual([undefined]);
    expect(rows[0]?.text).toBe('End not observed');
    expect(rows[0]?.endMs).toBe(45000);
  });
});
