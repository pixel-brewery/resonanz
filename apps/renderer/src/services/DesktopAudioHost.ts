// #region Imports
import { Injectable, inject } from '@angular/core';
import type { IAudioHost } from '../audio/IAudioHost';
import type { IAudioTranscriptSegment } from '../audio/IAudioTranscriptSegment';
import { DesktopApi } from './DesktopApi';
// #endregion

/** Adapts the shared recording/live coordinators to the typed desktop contract. */
@Injectable({ providedIn: 'root' })
export class DesktopAudioHost implements IAudioHost {
  private readonly _api = inject(DesktopApi);

  public createSession(input: Parameters<IAudioHost['createSession']>[0]) {
    return this._api.request('sessions.create', input);
  }
  public persistChunk(input: Parameters<IAudioHost['persistChunk']>[0]) {
    return this._api.request('audio.append', input);
  }
  public finishSession(input: Parameters<IAudioHost['finishSession']>[0]) {
    return this._api.request('sessions.finish', input);
  }
  public setCaptureStatus(input: {
    readonly sessionId: string;
    readonly status: 'recording' | 'paused';
  }) {
    return this._api.request('sessions.update', input);
  }
  public appendTranscript(input: IAudioTranscriptSegment) {
    return this._api.request('transcript.append', input);
  }
  public speechStart(input: Parameters<IAudioHost['speechStart']>[0]) {
    return this._api.request('speech.start', input);
  }
  public speechStop(input: Parameters<IAudioHost['speechStop']>[0]) {
    return this._api.request('speech.stop', input);
  }
  public speechListen(input: Parameters<IAudioHost['speechListen']>[0]) {
    return this._api.request('speech.listen', input);
  }
  public speechSynthesize(input: Parameters<IAudioHost['speechSynthesize']>[0]) {
    return this._api.request('speech.synthesize', input);
  }
  public speechCancel(input: Parameters<IAudioHost['speechCancel']>[0]) {
    return this._api.request('speech.cancel', input);
  }
  public respond(input: Parameters<IAudioHost['respond']>[0]) {
    return this._api.request('live.respond', input);
  }
  public cancelResponse(input: Parameters<IAudioHost['cancelResponse']>[0]) {
    return this._api.request('assistant.cancel', input);
  }
  public onEvent(listener: Parameters<IAudioHost['onEvent']>[0]): () => void {
    return this._api.onEvent((event) => {
      if (
        event.type === 'speech.result' ||
        event.type === 'speech.error' ||
        event.type === 'assistant.text' ||
        event.type === 'assistant.completed' ||
        event.type === 'assistant.failed'
      )
        listener(event);
    });
  }
}
