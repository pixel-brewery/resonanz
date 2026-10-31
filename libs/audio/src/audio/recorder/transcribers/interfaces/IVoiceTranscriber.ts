import { InjectionToken } from '@angular/core';
import { ITranscriptionInput } from './ITranscriptionInput';

/**
 * Represents a strategy interface for converting voice audio to text.
 *
 * @public
 */
export interface IVoiceTranscriber {
    /**
     * Transcribes the provided audio blob into text.
     *
     * @param input The transcription input containing the audio blob and metadata.
     * @returns A promise resolving to the transcribed text.
     */
    transcribe(input: ITranscriptionInput): Promise<string>;
}

/**
 * Extends a voice transcriber with a manually controlled live recognition session.
 *
 * Browser speech recognition cannot consume a previously recorded Blob. Implementations
 * with this capability therefore listen while the owning recorder UI is active and return
 * the accumulated transcript only when the user explicitly finishes the session.
 *
 * @public
 */
export interface ILiveVoiceTranscriber extends IVoiceTranscriber {
    /**
     * Stable capability marker used without depending on a concrete implementation.
     *
     * @public
     * @readonly
     */
    readonly supportsLiveSessions: true;

    /**
     * Starts a manually controlled live recognition session.
     *
     * @param audioTrack - Already authorized live microphone track to recognize instead of the browser default.
     * @public
     */
    startSession(audioTrack?: MediaStreamTrack): Promise<void>;

    /**
     * Stops the active session and returns all recognized text.
     *
     * @public
     */
    stopSession(): Promise<string>;

    /**
     * Aborts the active session and discards its recognized text.
     *
     * @public
     */
    cancelSession(): void;
}

/**
 * Determines whether a configured transcriber supports live recognition sessions.
 *
 * @param transcriber - Configured transcription strategy.
 * @returns True when the strategy exposes the live-session lifecycle.
 * @public
 */
export function isLiveVoiceTranscriber(
    transcriber: IVoiceTranscriber | null | undefined
): transcriber is ILiveVoiceTranscriber {
    return Boolean(transcriber && 'supportsLiveSessions' in transcriber && transcriber.supportsLiveSessions === true);
}

/**
 * Injection token for providing an {@link IVoiceTranscriber} implementation.
 * If no provider is registered, transcription is considered unavailable.
 *
 * @public
 */
export const VOICE_TRANSCRIBER: InjectionToken<IVoiceTranscriber> = new InjectionToken<IVoiceTranscriber>(
    'VOICE_TRANSCRIBER'
);
