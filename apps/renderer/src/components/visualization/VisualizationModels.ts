/** Presentation-only contracts. These components know no session, IPC or AI owner. */
export type MarkerKind = 'decision' | 'task' | 'question' | 'moment';

export interface ITimelineMarker {
  readonly id: string;
  readonly kind: MarkerKind;
  readonly atMs: number;
  readonly label: string;
  readonly markedByUser?: boolean;
}

export interface ITimelineChapter {
  readonly id: string;
  readonly title: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly color?: string;
}

/** A bounded media range; the caller supplies progress through the timeline position. */
export interface ITimelineRange {
  readonly startMs: number;
  readonly endMs: number;
}

export interface ILandscapeItem {
  readonly id: string;
  readonly title: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly waveform: readonly number[];
  readonly markers: readonly ITimelineMarker[];
  readonly status: 'ready' | 'processing' | 'waiting' | 'error' | 'recording';
  readonly progress?: number;
  readonly detail?: string;
}
export interface ITopicPoint {
  readonly itemId: string;
  readonly atMs: number;
  readonly title: string;
  readonly when: string;
  readonly quote: string;
  readonly kind: MarkerKind;
}
export interface ITopicThread {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly color: string;
  readonly points: readonly ITopicPoint[];
}

export const chapterColors = [
  'var(--mosaik-color-info-500)',
  'var(--mosaik-color-secondary-500)',
  'var(--mosaik-color-info-700)',
  'var(--mosaik-color-tertiary-500)',
  'var(--mosaik-color-highlight-500)',
  'var(--mosaik-color-warning-500)',
] as const;

export const markerLabels: Readonly<Record<MarkerKind, string>> = {
  decision: 'loc.resonanz.marker.decision',
  task: 'loc.resonanz.marker.task',
  question: 'loc.resonanz.marker.question',
  moment: 'loc.resonanz.marker.moment',
};

/** Peak-preserving resampling for recorded amplitudes, including silence and missing audio. */
export function waveformBins(values: readonly number[], count: number): readonly number[] {
  const size = Math.max(1, Math.min(720, Math.floor(count) || 1));
  return Array.from({ length: size }, (_, i) => {
    const start = Math.floor((i * values.length) / size);
    const end = Math.max(start + 1, Math.floor(((i + 1) * values.length) / size));
    let peak = 0;
    for (let j = start; j < Math.min(end, values.length); j++) {
      const value = values[j] ?? 0;
      if (Number.isFinite(value)) peak = Math.max(peak, Math.min(1, Math.max(0, value)));
    }
    return peak;
  });
}

export function timelineRatio(atMs: number, durationMs: number): number {
  return durationMs > 0 && Number.isFinite(atMs) ? Math.max(0, Math.min(1, atMs / durationMs)) : 0;
}

export function polarPoint(ratio: number, radius: number): { x: number; y: number } {
  const angle = ((ratio * 360 - 90) * Math.PI) / 180;
  return { x: 300 + radius * Math.cos(angle), y: 300 + radius * Math.sin(angle) };
}

export function arcPath(start: number, end: number, radius: number): string {
  const from = polarPoint(start, radius);
  const to = polarPoint(Math.min(start + 0.9999, end), radius);
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${end - start > 0.5 ? 1 : 0} 1 ${to.x} ${to.y}`;
}
