// #region Imports

import { Injectable } from '@angular/core';

// #endregion

/**
 * Owns construction of native browser media resources.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class AudioBrowserRuntime {
  // #region Fields
  // #endregion

  // #region Ctor
  // #endregion

  // #region Properties
  // #endregion

  // #region Methods

  /**
   * Creates a detached playback element without exposing Node APIs.
   *
   * @public
   */
  public createAudioElement(): HTMLAudioElement {
    return document.createElement('audio');
  }

  /**
   * Creates a media graph used only to archive both conversation channels.
   *
   * @public
   */
  public createAudioContext(): AudioContext {
    return new AudioContext();
  }

  /**
   * Creates the host-owned stereo conversation recorder.
   *
   * @public
   */
  public createMediaRecorder(stream: MediaStream, mimeType: string): MediaRecorder {
    return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 });
  }

  /**
   * Selects the same ordered MIME preferences as the copied recorder.
   *
   * @public
   */
  public recordingMimeType(): string {
    const preferences = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];
    const supported = preferences.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));

    if (!supported) {
      throw new Error('Dieser Browser unterstützt kein geeignetes Audio-Aufnahmeformat.');
    }

    return supported;
  }

  /**
   * Reads a monotonic clock for recording and transcript offsets.
   *
   * @public
   */
  public now(): number {
    return performance.now();
  }

  // #endregion
}
