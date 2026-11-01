/** Requires continuous measured quiet input, not missing audio callbacks. */
export class SilenceReminderDetector {
  public static readonly quietWindowMs = 5 * 60 * 1000;
  private static readonly _maximumFrameGapMs = 2000;
  private static readonly _activityRms = 0.01;
  private _sessionId: string | null = null;
  private _lastFrameAt: number | null = null;
  private _quietSince: number | null = null;
  private _announced = false;

  /** Returns true once after five uninterrupted minutes of actual quiet PCM frames. */
  public observe(input: {
    readonly sessionId: string;
    readonly atMs: number;
    readonly rms: number;
    readonly eligible: boolean;
  }): boolean {
    if (
      !input.eligible ||
      !Number.isFinite(input.atMs) ||
      !Number.isFinite(input.rms) ||
      input.rms < 0
    ) {
      this.reset();
      return false;
    }
    const discontinuity =
      input.sessionId !== this._sessionId ||
      this._lastFrameAt === null ||
      input.atMs < this._lastFrameAt ||
      input.atMs - this._lastFrameAt > SilenceReminderDetector._maximumFrameGapMs;
    if (discontinuity) {
      this._quietSince = input.atMs;
      this._announced = false;
    }
    this._sessionId = input.sessionId;
    this._lastFrameAt = input.atMs;
    if (input.rms >= SilenceReminderDetector._activityRms) {
      this._quietSince = input.atMs;
      this._announced = false;
      return false;
    }
    this._quietSince ??= input.atMs;
    if (
      !this._announced &&
      input.atMs - this._quietSince >= SilenceReminderDetector.quietWindowMs
    ) {
      this._announced = true;
      return true;
    }
    return false;
  }

  /** Continuing explicitly starts a fresh quiet window for this capture. */
  public acknowledge(sessionId: string, now: number): void {
    this._sessionId = sessionId;
    this._lastFrameAt = now;
    this._quietSince = now;
    this._announced = false;
  }

  /** Paused, muted, speaking, disabled and changed captures have no pending reminder. */
  public reset(): void {
    this._sessionId = null;
    this._lastFrameAt = null;
    this._quietSince = null;
    this._announced = false;
  }
}
