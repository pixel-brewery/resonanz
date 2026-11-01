/** Logical byte lengths of managed library files; account profiles and caches are excluded. */
export interface IStorageUsage {
  readonly measuredAt: string;
  readonly audioBytes: number;
  readonly transcriptBytes: number;
  readonly analysisBytes: number;
  readonly metadataBytes: number;
  readonly totalBytes: number;
  readonly sessionCount: number;
}
