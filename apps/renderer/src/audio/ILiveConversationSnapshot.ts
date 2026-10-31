/**
 * Exposes the live media lifecycle without taking ownership of persisted sessions.
 *
 * @public
 */
export interface ILiveConversationSnapshot {
  readonly state:
    'idle' | 'starting' | 'connecting' | 'live' | 'paused' | 'stopping' | 'error' | 'disposed';
  readonly stage: 'idle' | 'listening' | 'thinking' | 'speaking';
  readonly sessionId: string | null;
  readonly durationMs: number;
  readonly pendingBytes: number;
  readonly microphoneLevel: number;
  readonly assistantLevel: number;
  readonly microphoneMuted: boolean;
  readonly assistantMuted: boolean;
  readonly participantDraft: string;
  readonly assistantDraft: string;
  readonly pendingResponses: number;
  readonly listening: boolean;
  readonly error: string | null;
}
