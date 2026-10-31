// #region Imports

import type { IAudioHost } from './IAudioHost';
import type { IAudioTranscriptSegment } from './IAudioTranscriptSegment';

// #endregion

/**
 * Coalesces superseded captions while serializing authoritative transcript writes.
 *
 * @public
 */
export class TranscriptCommitQueue {
  // #region Fields

  private readonly _pending = new Map<string, IAudioTranscriptSegment>();
  private _drainPromise: Promise<void> | null = null;
  private _failure: Error | null = null;

  // #endregion

  // #region Ctor

  /**
   * Creates a bounded commit path for one host's transcript operation.
   *
   * @public
   */
  public constructor(
    private readonly _host: Pick<IAudioHost, 'appendTranscript'>,
    private readonly _onFailure: (error: Error) => void,
  ) {}

  // #endregion

  // #region Properties
  // #endregion

  // #region Methods

  /**
   * Replaces an uncommitted partial update with its newest complete value.
   *
   * @public
   */
  public enqueue(segment: IAudioTranscriptSegment): void {
    if (this._failure !== null) {
      throw this._failure;
    }

    if (this._pending.size >= 64 && !this._pending.has(segment.id)) {
      this.fail(
        new Error('Die Live-Transkriptablage kann nicht mit der Unterhaltung Schritt halten.'),
      );
      throw this._failure;
    }

    this._pending.set(segment.id, segment);
    this.startDrain();
  }

  /**
   * Waits until all caption updates were committed, including coalesced values.
   *
   * @public
   */
  public async flush(): Promise<void> {
    while (this._drainPromise !== null) {
      await this._drainPromise;
    }

    if (this._failure !== null) {
      throw this._failure;
    }
  }

  private startDrain(): void {
    if (this._drainPromise !== null) {
      return;
    }

    this._drainPromise = Promise.resolve()
      .then(async () => {
        while (this._pending.size > 0) {
          const first = this._pending.entries().next().value;

          if (first === undefined) return;
          const [id, segment] = first;
          this._pending.delete(id);
          await this._host.appendTranscript(segment);
        }
      })
      .catch((error: unknown) => this.fail(error))
      .finally(() => {
        this._drainPromise = null;
        if (this._failure === null && this._pending.size > 0) this.startDrain();
      });
  }

  private fail(error: unknown): void {
    if (this._failure === null) {
      this._failure = error instanceof Error ? error : new Error(String(error));
      this._pending.clear();
      this._onFailure(this._failure);
    }
  }

  // #endregion
}
