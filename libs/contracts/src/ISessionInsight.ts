/** A user-marked moment, distinct from an assistant's extracted claim. */
export interface ISessionMoment {
  readonly id: string;
  readonly kind: 'decision' | 'task' | 'question' | 'moment';
  readonly atMs: number;
  readonly label?: string;
  /** Older markers without an origin were created during capture. */
  readonly origin?: 'capture' | 'note';
}

/** Evidence is resolved against a real segment by the application owner. */
export interface ITranscriptEvidence {
  readonly segmentId: string;
  readonly atMs: number;
  readonly endMs: number;
  readonly quote: string;
}

export interface IInsightClaim {
  readonly id: string;
  readonly text: string;
  readonly evidence: readonly ITranscriptEvidence[];
  readonly assignee?: string;
  readonly due?: string;
  readonly completed?: boolean;
}

/** An assistant-extracted topic anchored to original transcript evidence. */
export interface IInsightTopic extends IInsightClaim {
  /** A stable, language-independent topic key used to connect sessions. */
  readonly key: string;
  readonly title: string;
  readonly kind: 'decision' | 'task' | 'question' | 'moment';
  /** Present only when the analysis identifies an explicit open or resolved subject. */
  readonly resolution?: 'open' | 'resolved';
}

export interface ISessionChapter {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface ISessionAnalysis {
  readonly provider: string;
  readonly createdAt: string;
  readonly summary: readonly IInsightClaim[];
  readonly decisions: readonly IInsightClaim[];
  readonly tasks: readonly IInsightClaim[];
  readonly openQuestions: readonly IInsightClaim[];
  readonly chapters: readonly ISessionChapter[];
  /** Missing on older analyses; tag-based local connections remain available. */
  readonly topics?: readonly IInsightTopic[];
}

export interface ISessionAnswer {
  readonly kind: 'evidenced' | 'gap';
  readonly claims: readonly IInsightClaim[];
  readonly related: readonly ITranscriptEvidence[];
}
