/**
 * Detects sustained microphone activity after browser echo cancellation.
 *
 * @public
 */
export class MicrophoneVoiceGate {
  // #region Fields

  private _voicedMs = 0;
  private _quietMs = 0;
  private _triggered = false;

  // #endregion

  // #region Ctor
  // #endregion

  // #region Properties
  // #endregion

  // #region Methods

  /**
   * Requires sustained near-end energy instead of interrupting on a short click.
   *
   * @public
   */
  public observe(
    rms: number,
    frameDurationMs: number,
    suppressed: boolean,
    outputAgeMs: number,
  ): boolean {
    if (!suppressed || outputAgeMs < 250) {
      this.reset();
      return false;
    }

    const duration = Math.max(0, Math.min(100, frameDurationMs));
    if (rms >= 0.025) {
      this._voicedMs += duration;
      this._quietMs = 0;
    } else {
      this._quietMs += duration;
      if (this._quietMs >= 100) this._voicedMs = 0;
    }

    if (!this._triggered && this._voicedMs >= 200) {
      this._triggered = true;
      return true;
    }

    return false;
  }

  /**
   * Begins a new decision window when recognition or playback changes.
   *
   * @public
   */
  public reset(): void {
    this._voicedMs = 0;
    this._quietMs = 0;
    this._triggered = false;
  }

  // #endregion
}
