// #region Imports

import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { RealtimeAudioWorkletModuleLoader } from '@resonanz/audio';

// #endregion

/**
 * Loads the unchanged PCM processors from a same-origin static application asset.
 *
 * @public
 */
@Injectable()
export class SelfHostedRealtimeAudioWorkletModuleLoader extends RealtimeAudioWorkletModuleLoader {
  // #region Fields

  private readonly _document = inject(DOCUMENT);

  // #endregion

  // #region Ctor
  // #endregion

  // #region Properties
  // #endregion

  // #region Methods

  /**
   * Registers the public PCM definition without a blob URL or a CSP exception.
   *
   * @param audioContext - Context that owns the capture or playback processor.
   * @public
   */
  public override async load(audioContext: AudioContext): Promise<void> {
    if (!audioContext.audioWorklet?.addModule) {
      throw new Error('AudioWorklet module loading is unavailable.');
    }

    const moduleUrl = new URL('audio/pcm-audio.worklet.js', this._document.baseURI);
    await audioContext.audioWorklet.addModule(moduleUrl.href);
  }

  // #endregion
}
