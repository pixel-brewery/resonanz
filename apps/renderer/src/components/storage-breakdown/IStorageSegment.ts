/** One measured, non-overlapping byte category in a storage breakdown. */
export interface IStorageSegment {
  readonly id: string;
  readonly label: string;
  readonly bytes: number;
  readonly variant: 'primary' | 'info' | 'highlight' | 'neutral';
}
