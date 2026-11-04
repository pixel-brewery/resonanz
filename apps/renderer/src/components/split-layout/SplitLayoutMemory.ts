type SplitUnit = 'px' | '%';
type SplitStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Stores optional, device-local pane preferences independently of session data. */
export class SplitLayoutMemory {
  public constructor(private readonly _storage: SplitStorage | undefined) {}

  /** Ignores invalid preferences and unavailable storage so the default layout still works. */
  public read(pane: string, unit: SplitUnit): number | undefined {
    try {
      const stored = this._storage?.getItem(this.key(pane, unit));
      const size = stored?.trim() ? Number(stored) : Number.NaN;
      return this.valid(size, unit) ? size : undefined;
    } catch {
      return undefined;
    }
  }

  /** Remembers a user adjustment without making persistence a requirement for resizing. */
  public remember(pane: string, size: number, unit: SplitUnit): void {
    if (!this.valid(size, unit)) return;
    try {
      this._storage?.setItem(this.key(pane, unit), String(size));
    } catch {
      // Blocked or full storage only loses the remembered pane preference.
    }
  }

  private key(pane: string, unit: SplitUnit): string {
    return `resonanz.layout.${pane}.${unit === '%' ? 'ratio' : 'pixels'}`;
  }

  private valid(size: number, unit: SplitUnit): boolean {
    return Number.isFinite(size) && size > 0 && (unit === 'px' || size < 100);
  }
}
