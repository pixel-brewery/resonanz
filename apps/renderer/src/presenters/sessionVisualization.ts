import type { IInsightClaim, ISession, ITranscriptEvidence } from '@resonanz/contracts';
import { isUserAssignee } from '@resonanz/contracts';
import { translate } from '@resonanz/intl';
import type { ITimelineMarker } from '../components/visualization/VisualizationModels';
import { type ITopicThread } from '../components/visualization/VisualizationModels';

/** Domain-to-visual projection stays outside the generic drawing components. */
export function sessionMarkers(session: ISession | null): readonly ITimelineMarker[] {
  if (!session) return [];
  const markers: ITimelineMarker[] = (session.moments ?? []).map((m) => ({
    ...m,
    label:
      m.label ??
      {
        decision: 'loc.resonanz.marker.decision',
        task: 'loc.resonanz.marker.task',
        question: 'loc.resonanz.marker.question',
        moment: 'loc.resonanz.marker.moment',
      }[m.kind],
    markedByUser: true,
  }));
  const userIds = new Set((session.moments ?? []).map((moment) => moment.id));
  const analysis = session.analysis;
  if (analysis)
    for (const [claims, kind] of [
      [analysis.decisions, 'decision'],
      [analysis.tasks, 'task'],
      [analysis.openQuestions, 'question'],
    ] as const) {
      for (const claim of claims)
        for (const evidence of claim.evidence) {
          const userIndex = markers.findIndex(
            (m) =>
              userIds.has(m.id) &&
              m.markedByUser &&
              m.kind === kind &&
              Math.abs(m.atMs - evidence.atMs) < 15_000,
          );
          const userMarked = userIndex >= 0;
          if (userMarked) markers.splice(userIndex, 1);
          if (markers.some((m) => m.id === `${claim.id}:${evidence.segmentId}`)) continue;
          markers.push({
            id: `${claim.id}:${evidence.segmentId}`,
            kind,
            atMs: evidence.atMs,
            label: claim.text,
            markedByUser: userMarked,
          });
        }
    }
  return markers.sort((a, b) => a.atMs - b.atMs);
}
export function allClaims(session: ISession | null): readonly IInsightClaim[] {
  return session?.analysis
    ? [
        ...session.analysis.decisions,
        ...session.analysis.tasks,
        ...session.analysis.openQuestions,
        ...session.analysis.summary,
      ]
    : [];
}
export function findEvidence(
  session: ISession | null,
  marker: ITimelineMarker,
): ITranscriptEvidence | undefined {
  return (
    allClaims(session)
      .flatMap((c) => c.evidence)
      .find((e) => e.atMs === marker.atMs) ??
    (() => {
      const segment = session?.transcript.find(
        (s) => s.startMs <= marker.atMs && s.endMs >= marker.atMs,
      );
      return segment
        ? {
            segmentId: segment.id,
            atMs: segment.startMs,
            endMs: segment.endMs,
            quote: segment.text,
          }
        : undefined;
    })()
  );
}
export function isMyTask(claim: IInsightClaim, name: string, aliases: string): boolean {
  return isUserAssignee(claim.assignee, name, aliases);
}

/** Connects only validated topic references; older analyses retain exact tag/text connections. */
export function sessionTopicThreads(
  sessions: readonly ISession[],
  locale = 'en-US',
): readonly ITopicThread[] {
  const language = locale.startsWith('de') ? 'de' : 'en';
  const palette = [
    'var(--mosaik-color-tertiary-500)',
    'var(--mosaik-color-secondary-500)',
    'var(--mosaik-color-highlight-500)',
  ];
  const chronological = sessions.toSorted(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const when = (session: ISession, atMs: number): string => {
    const start = new Date(session.createdAt);
    const point = new Date(start.getTime() + atMs);
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(point);
  };
  const topics = new Map<
    string,
    {
      session: ISession;
      topic: NonNullable<NonNullable<ISession['analysis']>['topics']>[number];
      evidence: ITranscriptEvidence;
    }[]
  >();
  for (const session of chronological)
    for (const topic of session.analysis?.topics ?? []) {
      const entries = topics.get(topic.key) ?? [];
      for (const evidence of topic.evidence) {
        const segment = session.transcript.find(
          (segment) => segment.id === evidence.segmentId && segment.final,
        );
        if (
          !segment ||
          segment.text !== evidence.quote ||
          segment.startMs !== evidence.atMs ||
          segment.endMs !== evidence.endMs
        )
          continue;
        if (
          entries.some(
            (entry) =>
              entry.session.id === session.id && entry.evidence.segmentId === evidence.segmentId,
          )
        )
          continue;
        entries.push({ session, topic, evidence });
      }
      topics.set(topic.key, entries);
    }
  const topicGroups = [...topics].toSorted(
    ([keyA, a], [keyB, b]) =>
      Number(b.at(-1)?.topic.resolution === 'resolved') -
        Number(a.at(-1)?.topic.resolution === 'resolved') ||
      b.length - a.length ||
      keyA.localeCompare(keyB),
  );
  const inferred = topicGroups.flatMap(([key, entries], index): readonly ITopicThread[] => {
    if (new Set(entries.map((entry) => entry.session.id)).size < 2) return [];
    entries.sort(
      (a, b) =>
        Date.parse(a.session.createdAt) - Date.parse(b.session.createdAt) ||
        a.evidence.atMs - b.evidence.atMs,
    );
    const latest = entries.at(-1)!;
    const topic = latest.topic;
    const matchingTask = latest.session.analysis?.tasks.find((task) =>
      task.evidence.some((e) => topic.evidence.some((own) => own.segmentId === e.segmentId)),
    );
    const day = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
      new Date(Date.parse(latest.session.createdAt) + latest.evidence.atMs),
    );
    const status =
      topic.resolution === 'resolved'
        ? translate(language, 'loc.resonanz.landscape.resolvedOn', day)
        : topic.resolution === 'open'
          ? translate(language, 'loc.resonanz.landscape.openTopic')
          : topic.kind === 'task'
            ? matchingTask?.completed
              ? translate(language, 'loc.resonanz.landscape.taskCompleted')
              : topic.assignee
                ? translate(language, 'loc.resonanz.landscape.openTaskFor', topic.assignee)
                : translate(language, 'loc.resonanz.landscape.unassignedTask')
            : translate(language, 'loc.resonanz.landscape.openTopic');
    return [
      {
        id: `topic:${key}`,
        title: topic.title,
        status,
        color: palette[index % palette.length]!,
        points: entries.map(({ session, topic, evidence }) => ({
          itemId: session.id,
          title: session.title,
          atMs: evidence.atMs,
          quote: evidence.quote,
          kind: topic.kind,
          when: when(session, evidence.atMs),
        })),
      },
    ];
  });
  const tags = new Map<string, string>();
  for (const session of chronological)
    for (const tag of session.tags) tags.set(tag.toLocaleLowerCase(locale), tag);
  const local = [...tags].flatMap(([key, title], index): readonly ITopicThread[] => {
    const points = chronological
      .filter((session) => session.tags.some((tag) => tag.toLocaleLowerCase(locale) === key))
      .flatMap((session) => {
        const segment = session.transcript.find(
          (segment) => segment.final && segment.text.toLocaleLowerCase(locale).includes(key),
        );
        if (!segment) return [];
        const marker = sessionMarkers(session).find((marker) => marker.atMs === segment.startMs);
        return [
          {
            itemId: session.id,
            title: session.title,
            atMs: segment.startMs,
            quote: segment.text,
            kind: marker?.kind ?? ('moment' as const),
            when: when(session, segment.startMs),
          },
        ];
      });
    return points.length >= 2 && !topics.has(key)
      ? [
          {
            id: `tag:${key}`,
            title,
            status: 'loc.resonanz.landscape.tagConnected',
            color: palette[(inferred.length + index) % palette.length]!,
            points,
          },
        ]
      : [];
  });
  return [...inferred, ...local];
}

/** Indexes transcript markers in one ordered pass, preferring a user-marked moment. */
export function transcriptMarkerIndex(
  session: ISession | null,
): ReadonlyMap<string, ITimelineMarker> {
  const markers = sessionMarkers(session);
  const segments = (session?.transcript ?? []).toSorted((a, b) => a.startMs - b.startMs);
  const result = new Map<string, ITimelineMarker>();
  let cursor = 0;
  for (const marker of markers) {
    while (cursor + 1 < segments.length && segments[cursor + 1]!.startMs <= marker.atMs) cursor++;
    const segment = segments[cursor];
    if (!segment || marker.atMs < segment.startMs || marker.atMs > segment.endMs) continue;
    if (!result.has(segment.id) || marker.markedByUser) result.set(segment.id, marker);
  }
  return result;
}
