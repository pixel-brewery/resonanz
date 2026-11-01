import type { ISessionSummary } from '@resonanz/contracts';

export interface ILibraryDateGroup {
  readonly id: string;
  readonly date: Date;
  readonly sessions: readonly ISessionSummary[];
}

/** Local calendar groups match the handoff without treating a DST day as 24 hours. */
export function groupLibrarySessions(
  sessions: readonly ISessionSummary[],
  now: Date,
): readonly ILibraryDateGroup[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const groups = new Map<string, { id: string; date: Date; sessions: ISessionSummary[] }>();
  for (const session of sessions.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const date = new Date(session.createdAt);
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const id =
      day.getTime() === today.getTime()
        ? 'today'
        : day.getTime() === yesterday.getTime()
          ? 'yesterday'
          : day >= monday && day < today
            ? 'thisWeek'
            : `${day.getFullYear()}-${day.getMonth()}`;
    const group = groups.get(id) ?? { id, date, sessions: [] };
    group.sessions.push(session);
    groups.set(id, group);
  }
  return [...groups.values()];
}
