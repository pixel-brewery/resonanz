import type { ITranscriptEntry } from './TranscriptPanelComponent';

interface ITranscriptSearchResult {
  readonly query: string;
  readonly entries: readonly ITranscriptEntry[];
  readonly matchingIds: ReadonlySet<string>;
  readonly matchCount: number;
}

/** Counts matching speech passages; pause annotations remain context, never search evidence. */
export function transcriptSearch(
  entries: readonly ITranscriptEntry[],
  query: string,
  keepContext = false,
): ITranscriptSearchResult {
  const term = query.trim();
  const normalized = term.toLocaleLowerCase();
  const matchingIds = new Set(
    normalized
      ? entries
          .filter(
            (entry) =>
              entry.kind !== 'pause' && entry.text.toLocaleLowerCase().includes(normalized),
          )
          .map((entry) => entry.id)
      : [],
  );
  return {
    query: term,
    entries:
      keepContext || !normalized ? entries : entries.filter((entry) => matchingIds.has(entry.id)),
    matchingIds,
    matchCount: matchingIds.size,
  };
}
