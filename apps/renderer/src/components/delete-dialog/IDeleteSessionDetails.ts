/** Presentation metadata for the local content removed by a session deletion. */
export interface IDeleteSessionDetails {
  readonly transcriptState: 'empty' | 'partial' | 'ready' | 'unknown';
  readonly wordCount: number;
  readonly analysisAvailable: boolean;
  readonly questionCount: number;
  readonly markerCount: number;
}
