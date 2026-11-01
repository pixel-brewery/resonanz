import type { ISessionPause } from '@resonanz/contracts';
import type { ITranscriptEntry } from '../components/transcript-panel/TranscriptPanelComponent';

/** Interleaves explicit nonspeech annotations without changing any source segment. */
export function transcriptEntriesWithPauses(
  speech: readonly ITranscriptEntry[],
  pauses: readonly ISessionPause[],
  label: (durationMs: number | undefined) => string,
): readonly ITranscriptEntry[] {
  return [
    ...speech,
    ...pauses.map((pause) => ({
      id: `pause-${pause.id}`,
      kind: 'pause' as const,
      text: label(pause.durationMs),
      startMs: pause.atMs,
      endMs: pause.atMs,
    })),
  ].sort(
    (left, right) =>
      left.startMs - right.startMs ||
      Number(right.kind === 'pause') - Number(left.kind === 'pause'),
  );
}
