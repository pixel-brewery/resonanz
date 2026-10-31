// #region Imports

import type { IAudioHost } from './IAudioHost';

// #endregion

/**
 * Bounds retained audio and commits chunks serially without acknowledging failed writes.
 *
 * @public
 */
export class OrderedAudioChunkWriter {
  // #region Fields

  private _tail: Promise<void> = Promise.resolve();
  private _failure: Error | null = null;
  private _writeFailed = false;
  private _pendingBytes = 0;
  private _nextSequence = 1;
  private _closed = false;

  // #endregion

  // #region Ctor

  /**
   * Creates a writer for one logical session and one recording channel.
   *
   * @public
   */
  public constructor(
    private readonly _host: Pick<IAudioHost, 'persistChunk'>,
    private readonly _sessionId: string,
    private readonly _channel: 'microphone' | 'conversation',
    private readonly _onFailure: (error: Error) => void,
    private readonly _onPendingChanged: (bytes: number) => void,
    private readonly _maximumPendingBytes = 16 * 1024 * 1024,
  ) {}

  // #endregion

  // #region Properties

  /**
   * The encoded bytes still waiting for durable host acknowledgement.
   *
   * @public
   * @readonly
   */
  public get pendingBytes(): number {
    return this._pendingBytes;
  }

  // #endregion

  // #region Methods

  /**
   * Retains one bounded blob and queues its conversion and durable commit.
   *
   * @public
   */
  public enqueue(blob: Blob, mimeType: string, elapsedMs: number): void {
    if (this._closed) {
      throw new Error('Die Audioablage wurde bereits beendet.');
    }

    if (this._failure !== null) {
      throw this._failure;
    }

    if (blob.size <= 0) {
      return;
    }

    if (this._pendingBytes + blob.size > this._maximumPendingBytes) {
      const error = new Error('Die Audioablage ist zu langsam. Die Aufnahme wurde angehalten.');
      this.fail(error);
      throw error;
    }

    const sequence = this._nextSequence++;
    this._pendingBytes += blob.size;
    this._onPendingChanged(this._pendingBytes);
    this._tail = this._tail
      .then(async () => {
        if (this._writeFailed) {
          return;
        }

        await this._host.persistChunk({
          sessionId: this._sessionId,
          sequence,
          bytes: await blob.arrayBuffer(),
          mimeType,
          elapsedMs: Math.max(0, Math.round(elapsedMs)),
          channel: this._channel,
        });
      })
      .catch((error: unknown) => {
        this._writeFailed = true;
        this.fail(error);
      })
      .finally(() => {
        this._pendingBytes -= blob.size;
        this._onPendingChanged(this._pendingBytes);
      });
  }

  /**
   * Waits for queued commits and propagates the first persistence failure.
   *
   * @public
   */
  public async drain(): Promise<void> {
    await this._tail;

    if (this._failure !== null) {
      throw this._failure;
    }
  }

  /**
   * Refuses new fragments before waiting for the last durable commit.
   *
   * @public
   */
  public async close(): Promise<void> {
    this._closed = true;
    await this.drain();
  }

  private fail(error: unknown): void {
    if (this._failure === null) {
      this._failure = error instanceof Error ? error : new Error(String(error));
      this._onFailure(this._failure);
    }
  }

  // #endregion
}
