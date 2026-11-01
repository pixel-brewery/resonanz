import { translate, type UiLanguage } from '@resonanz/intl';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  IInsightClaim,
  ISession,
  ISessionAnalysis,
  ISessionAnswer,
  ITranscriptEvidence,
} from '@resonanz/contracts';

const rawClaim = z.object({
  text: z.string().min(1).max(12_000),
  segmentIds: z.array(z.string().max(200)).max(30),
  assignee: z.string().max(200).optional(),
  due: z.string().max(200).optional(),
});
const rawAnalysis = z.object({
  summary: z.array(rawClaim).max(100),
  decisions: z.array(rawClaim).max(100),
  tasks: z.array(rawClaim).max(100),
  openQuestions: z.array(rawClaim).max(100),
  topics: z
    .array(
      rawClaim.extend({
        key: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
          .max(100),
        title: z.string().min(1).max(200),
        kind: z.enum(['decision', 'task', 'question', 'moment']),
        resolution: z.enum(['open', 'resolved']).optional(),
      }),
    )
    .max(100)
    .optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        summary: z.string().max(4000),
        firstSegmentId: z.string(),
        lastSegmentId: z.string(),
      }),
    )
    .max(100),
});
const rawAnswer = z.object({
  kind: z.enum(['evidenced', 'gap']),
  claims: z.array(rawClaim).max(100),
  relatedSegmentIds: z.array(z.string().max(200)).max(30).default([]),
});

function json(text: string): unknown {
  try {
    return JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/u, '')
        .replace(/\s*```$/u, ''),
    );
  } catch {
    return null;
  }
}

/** Quotes and time bounds are always copied from stored segments, never trusted model output. */
function evidence(ids: readonly string[], session: ISession): readonly ITranscriptEvidence[] {
  return [...new Set(ids)].flatMap((id) => {
    const segment = session.transcript.find((s) => s.id === id && s.final && s.text.trim());
    return segment
      ? [{ segmentId: id, atMs: segment.startMs, endMs: segment.endMs, quote: segment.text }]
      : [];
  });
}
function claim(value: z.infer<typeof rawClaim>, session: ISession): IInsightClaim {
  return {
    id: randomUUID(),
    text: value.text,
    evidence: evidence(value.segmentIds, session),
    ...(value.assignee ? { assignee: value.assignee } : {}),
    ...(value.due ? { due: value.due } : {}),
  };
}

/** A legacy prose result stays readable but is never advertised as verified structured evidence. */
export function parseSessionAnalysis(
  text: string,
  session: ISession,
  provider: string,
): ISessionAnalysis | undefined {
  const result = rawAnalysis.safeParse(json(text));
  if (!result.success) return undefined;
  const value = result.data;
  return {
    provider,
    createdAt: new Date().toISOString(),
    summary: value.summary.map((c) => claim(c, session)),
    decisions: value.decisions.map((c) => claim(c, session)),
    tasks: value.tasks.map((c) => claim(c, session)),
    openQuestions: value.openQuestions.map((c) => claim(c, session)),
    ...(value.topics
      ? {
          topics: value.topics.flatMap((topic) => {
            const resolved = claim(topic, session);
            return resolved.evidence.length
              ? [
                  {
                    ...resolved,
                    key: topic.key,
                    title: topic.title,
                    kind: topic.kind,
                    ...(topic.resolution ? { resolution: topic.resolution } : {}),
                  },
                ]
              : [];
          }),
        }
      : {}),
    chapters: value.chapters
      .flatMap((chapter) => {
        const first = session.transcript.find((s) => s.id === chapter.firstSegmentId && s.final);
        const last = session.transcript.find((s) => s.id === chapter.lastSegmentId && s.final);
        if (!first || !last || last.endMs < first.startMs) return [];
        if (session.durationMs > 0 && first.startMs >= session.durationMs) return [];
        return [
          {
            id: randomUUID(),
            title: chapter.title,
            summary: chapter.summary,
            startMs: first.startMs,
            endMs: Math.min(session.durationMs || last.endMs, last.endMs),
          },
        ];
      })
      .sort((a, b) => a.startMs - b.startMs),
  };
}
export function parseSessionAnswer(text: string, session: ISession): ISessionAnswer | undefined {
  const result = rawAnswer.safeParse(json(text));
  return result.success
    ? {
        kind: result.data.kind,
        claims: result.data.claims.map((c) => claim(c, session)),
        related: evidence(result.data.relatedSegmentIds, session),
      }
    : undefined;
}
export function analysisMarkdown(analysis: ISessionAnalysis, language: UiLanguage = 'en'): string {
  const lines = (claims: readonly IInsightClaim[]) =>
    claims
      .map(
        (c) => `- ${c.text}${c.evidence.map((e) => ` [${Math.floor(e.atMs / 1000)}s]`).join('')}`,
      )
      .join('\n');
  return [
    lines(analysis.summary),
    translate(language, 'loc.resonanz.analysis.markdownDecisions'),
    lines(analysis.decisions),
    translate(language, 'loc.resonanz.analysis.markdownTasks'),
    lines(analysis.tasks),
    translate(language, 'loc.resonanz.analysis.markdownQuestions'),
    lines(analysis.openQuestions),
  ].join('\n\n');
}
export function answerText(answer: ISessionAnswer, language: UiLanguage = 'en'): string {
  return [
    answer.kind === 'gap' ? translate(language, 'loc.resonanz.question.gap') : '',
    ...answer.claims.map((c) => c.text),
  ]
    .filter(Boolean)
    .join('\n\n');
}
