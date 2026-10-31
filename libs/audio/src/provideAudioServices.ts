// #region Imports

import type { Provider } from '@angular/core';
import { AudioInputDeviceService } from './audio/devices/AudioInputDeviceService';
import { AudioPlayer } from './audio/player/AudioPlayer';
import { providePcmAudioStreaming } from './audio/realtime/provider/providePcmAudioStreaming';
import { AudioRecorder } from './audio/recorder/AudioRecorder';
import {
  VOICE_TRANSCRIBER,
  type IVoiceTranscriber,
} from './audio/recorder/transcribers/interfaces/IVoiceTranscriber';

// #endregion

/**
 * Composes the unchanged recording, device and PCM services for the Resonanz host.
 *
 * @param transcriber - Optional strategy supplied by the desktop application.
 * @returns Angular providers for one owned audio-service scope.
 * @public
 */
export function provideAudioServices(transcriber?: IVoiceTranscriber | null): Provider[] {
  const providers: Provider[] = [
    AudioInputDeviceService,
    AudioPlayer,
    AudioRecorder,
    ...providePcmAudioStreaming(),
  ];

  if (transcriber !== undefined) {
    providers.push({ provide: VOICE_TRANSCRIBER, useValue: transcriber });
  }

  return providers;
}
