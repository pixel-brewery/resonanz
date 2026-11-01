import { Subject } from 'rxjs';
import type { ICapturePauseEvent } from './ICapturePauseEvent';

/** Measures real paused wall time at an unchanged archive-media offset. */
export class CapturePauseTracker {
  private readonly _events = new Subject<ICapturePauseEvent>();
  private _open: {
    readonly sessionId: string;
    readonly id: string;
    readonly atMs: number;
    readonly startedAt: number;
  } | null = null;
  public readonly events = this._events.asObservable();

  /** Emits only observed starts; duplicate pause commands preserve the same identity. */
  public begin(sessionId: string, atMs: number, now: number): void {
    if (this._open?.sessionId === sessionId) return;
    if (!Number.isFinite(atMs) || atMs < 0 || atMs > 86_400_000 || !Number.isFinite(now))
      throw new Error('loc.resonanz.error.pauseTiming');
    this._open = { sessionId, id: crypto.randomUUID(), atMs, startedAt: now };
    this._events.next({ sessionId, pause: { id: this._open.id, atMs } });
  }

  /** Completes a pause only when resume/stop was actually observed. */
  public end(now: number): void {
    const open = this._open;
    if (!open) return;
    if (!Number.isFinite(now) || now < open.startedAt)
      throw new Error('loc.resonanz.error.pauseTiming');
    this._open = null;
    this._events.next({
      sessionId: open.sessionId,
      pause: { id: open.id, atMs: open.atMs, durationMs: now - open.startedAt },
    });
  }

  /** A new media session never invents an end for a lost previous owner. */
  public reset(): void {
    this._open = null;
  }
  public dispose(): void {
    this.reset();
    this._events.complete();
  }
}
