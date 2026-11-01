import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ISessionSummary } from '@resonanz/contracts';
import { groupLibrarySessions } from './libraryGrouping';

function recording(id: string, date: Date): ISessionSummary {
  return {
    id,
    title: id,
    kind: 'recording',
    status: 'ready',
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    durationMs: 0,
    mimeType: 'audio/wav',
    audioBytes: 0,
    audioAvailable: false,
    starred: false,
    tags: [],
    collectionId: null,
  };
}
afterEach(() => vi.unstubAllEnvs());
describe('library calendar grouping', () => {
  it('groups today, yesterday and the remaining week before older months', () => {
    const now = new Date(2026, 9, 31, 12);
    const groups = groupLibrarySessions(
      [
        recording('old', new Date(2026, 8, 1)),
        recording('monday', new Date(2026, 9, 26, 10)),
        recording('today', new Date(2026, 9, 31, 8)),
        recording('yesterday', new Date(2026, 9, 30, 9)),
        recording('wednesday', new Date(2026, 9, 28, 15)),
      ],
      now,
    );
    expect(groups.map((group) => group.id)).toEqual(['today', 'yesterday', 'thisWeek', '2026-8']);
    expect(groups[2]!.sessions.map((session) => session.id)).toEqual(['wednesday', 'monday']);
  });
  it('keeps Sunday in yesterday when the spring DST transition makes it shorter than 24 hours', () => {
    vi.stubEnv('TZ', 'Europe/Berlin');
    const groups = groupLibrarySessions(
      [recording('sunday', new Date(2026, 2, 29, 0, 30))],
      new Date(2026, 2, 30, 0, 30),
    );
    expect(groups[0]!.id).toBe('yesterday');
  });
});
