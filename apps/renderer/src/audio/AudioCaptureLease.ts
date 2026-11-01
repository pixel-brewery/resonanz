// #region Imports

import { Injectable } from '@angular/core';

// #endregion

/**
 * Serializes ownership of the shared microphone across recording and live modes.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class AudioCaptureLease {
  // #region Fields

  private _owner: symbol | null = null;

  // #endregion

  // #region Ctor
  // #endregion

  // #region Properties
  // #endregion

  // #region Methods

  /**
   * Acquires the microphone before an asynchronous session start can race.
   *
   * @public
   */
  public acquire(owner: symbol): void {
    if (this._owner !== null && this._owner !== owner) {
      throw new Error('loc.resonanz.error.activeCapture');
    }

    this._owner = owner;
  }

  /**
   * Checks ownership before a completed coordinator touches shared services.
   *
   * @public
   */
  public owns(owner: symbol): boolean {
    return this._owner === owner;
  }

  /**
   * Releases only the caller's own microphone lease.
   *
   * @public
   */
  public release(owner: symbol): void {
    if (this._owner === owner) {
      this._owner = null;
    }
  }

  // #endregion
}
