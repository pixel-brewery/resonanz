// #region Imports

import type { IAudioTranscriptSegment } from './IAudioTranscriptSegment';
import type { AudioHostEvent } from './AudioHostEvent';

// #endregion

/**
 * Supplies persistence, system speech and Synapse operations to renderer audio.
 *
 * @public
 */
export interface IAudioHost {
  createSession(input: {
    readonly kind: 'recording' | 'conversation';
    readonly title?: string;
    readonly mimeType: string;
  }): Promise<{ readonly id: string }>;
  persistChunk(input: {
    readonly sessionId: string;
    readonly sequence: number;
    readonly bytes: ArrayBuffer;
    readonly mimeType: string;
    readonly elapsedMs: number;
    readonly channel: 'microphone' | 'conversation';
  }): Promise<unknown>;
  finishSession(input: {
    readonly sessionId: string;
    readonly durationMs: number;
    readonly error?: string;
  }): Promise<unknown>;
  setCaptureStatus?(input: {
    readonly sessionId: string;
    readonly status: 'recording' | 'paused';
  }): Promise<unknown>;
  appendTranscript(input: IAudioTranscriptSegment): Promise<unknown>;
  speechStart(input: { readonly sessionId: string }): Promise<unknown>;
  speechStop(input: { readonly sessionId: string }): Promise<unknown>;
  speechListen(input: {
    readonly sessionId: string;
    readonly enabled: boolean;
  }): Promise<{ readonly listening: boolean }>;
  speechSynthesize(input: {
    readonly sessionId: string;
    readonly speechId: string;
    readonly text: string;
    readonly voice?: string;
  }): Promise<{ readonly audioUrl: string }>;
  speechCancel(input: { readonly sessionId: string }): Promise<unknown>;
  respond(input: { readonly sessionId: string; readonly runId: string }): Promise<unknown>;
  cancelResponse(input: { readonly runId: string }): Promise<unknown>;
  onEvent(listener: (event: AudioHostEvent) => void): () => void;
}
