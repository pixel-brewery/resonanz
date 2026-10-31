// #region Imports

import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { AudioRecorderError } from './errors/AudioRecorderError';
import type { AudioRecorderErrorCode } from './errors/AudioRecorderErrorCode';
import type { AudioRecorderState } from './models/AudioRecorderState';
import type { AudioRecordingRetention } from './models/AudioRecordingRetention';
import type { IAudioRecorderChunk } from './models/IAudioRecorderChunk';
import type { IAudioRecorderStartOptions } from './models/IAudioRecorderStartOptions';
import type { IAudioRecordingResult } from './models/IAudioRecordingResult';
import { IVoiceTranscriber, VOICE_TRANSCRIBER } from './transcribers/interfaces/IVoiceTranscriber';

// #endregion

interface IMediaRecorderFailureEvent extends Event {
    readonly error?: DOMException;
}

interface INormalizedAudioRecorderStartOptions {
    readonly audioBitsPerSecond: number;
    readonly audioConstraints: MediaTrackConstraints;
    readonly chunkIntervalMs: number;
    readonly preferredMimeTypes: ReadonlyArray<string>;
    readonly retention: AudioRecordingRetention;
}

const DEFAULT_AUDIO_BITS_PER_SECOND = 128_000;
const DEFAULT_CHUNK_INTERVAL_MS = 1_000;
const DEFAULT_MIME_TYPES: ReadonlyArray<string> = Object.freeze([
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg'
]);

/**
 * Owns one microphone and emits bounded, ordered audio chunks while recording remains active.
 *
 * @public
 */
export class AudioRecorder {
    // #region Fields

    private readonly _destroyRef: DestroyRef = inject(DestroyRef);
    private readonly _transcriber: IVoiceTranscriber | null;
    private readonly _audioBlob = signal<Blob | null>(null);
    private readonly _audioUrl = signal<string | null>(null);
    private readonly _chunkAvailableSubject = new Subject<IAudioRecorderChunk>();
    private readonly _chunkAvailable = this._chunkAvailableSubject.asObservable();
    private readonly _durationMs = signal<number>(0);
    private readonly _durationLabel = computed<string>(() => this.formatDuration(this._durationMs()));
    private readonly _error = signal<AudioRecorderError | null>(null);
    private readonly _isActive = computed<boolean>(() => {
        const state = this._state();

        return state === 'acquiring' || state === 'recording' || state === 'paused' || state === 'stopping';
    });
    private readonly _isMuted = signal<boolean>(false);
    private readonly _isPaused = computed<boolean>(() => this._state() === 'paused');
    private readonly _isRecording = computed<boolean>(() => {
        const state = this._state();

        return state === 'recording' || state === 'paused';
    });
    private readonly _latestChunk = signal<IAudioRecorderChunk | null>(null);
    private readonly _mediaStream = signal<MediaStream | null>(null);
    private readonly _mimeType = signal<string | null>(null);
    private readonly _recordingCompletedSubject = new Subject<IAudioRecordingResult>();
    private readonly _recordingCompleted = this._recordingCompletedSubject.asObservable();
    private readonly _recordingResult = signal<IAudioRecordingResult | null>(null);
    private readonly _state = signal<AudioRecorderState>('idle');
    private _audioUrlValue: string | null = null;
    private _chunkSequence = 0;
    private _completionPromise: Promise<IAudioRecordingResult | null> | null = null;
    private _currentOptions: INormalizedAudioRecorderStartOptions | null = null;
    private _discardResult = false;
    private _generation = 0;
    private _mediaRecorder: MediaRecorder | null = null;
    private _pauseStartedAtMs = 0;
    private _pausedDurationMs = 0;
    private _rejectCompletion: ((reason?: unknown) => void) | null = null;
    private _resolveCompletion: ((result: IAudioRecordingResult | null) => void) | null = null;
    private _retainedChunks: BlobPart[] = [];
    private _startedAtMs = -1;
    private _timerId: ReturnType<typeof globalThis.setInterval> | null = null;

    // #endregion

    // #region Ctor

    /**
     * Creates the recorder with an optional post-recording transcription strategy.
     *
     * @param transcriber - Optional transcription strategy resolved through dependency injection.
     * @public
     */
    public constructor(transcriber: IVoiceTranscriber | null = inject(VOICE_TRANSCRIBER, { optional: true })) {
        this._transcriber = transcriber ?? null;
        this._destroyRef.onDestroy(() => this.dispose());
    }

    // #endregion

    // #region Properties

    /**
     * Complete recording payload when memory retention is enabled.
     *
     * @public
     * @readonly
     */
    public get audioBlob(): Signal<Blob | null> {
        return this._audioBlob.asReadonly();
    }

    /**
     * Object URL for the retained recording payload.
     *
     * @public
     * @readonly
     */
    public get audioUrl(): Signal<string | null> {
        return this._audioUrl.asReadonly();
    }

    /**
     * Ordered audio fragments emitted synchronously as the browser produces them.
     *
     * @public
     * @readonly
     */
    public get chunkAvailable(): Observable<IAudioRecorderChunk> {
        return this._chunkAvailable;
    }

    /**
     * Active recording duration in milliseconds, excluding paused intervals.
     *
     * @public
     * @readonly
     */
    public get durationMs(): Signal<number> {
        return this._durationMs.asReadonly();
    }

    /**
     * Active recording duration formatted as `mm:ss`.
     *
     * @public
     * @readonly
     */
    public get durationLabel(): Signal<string> {
        return this._durationLabel;
    }

    /**
     * Last typed capture or encoding failure.
     *
     * @public
     * @readonly
     */
    public get error(): Signal<AudioRecorderError | null> {
        return this._error.asReadonly();
    }

    /**
     * Indicates whether acquisition, recording, pausing, or stopping is in progress.
     *
     * @public
     * @readonly
     */
    public get isActive(): Signal<boolean> {
        return this._isActive;
    }

    /**
     * Indicates whether the owned microphone track currently emits silence.
     *
     * @public
     * @readonly
     */
    public get isMuted(): Signal<boolean> {
        return this._isMuted.asReadonly();
    }

    /**
     * Indicates whether the current recording is paused.
     *
     * @public
     * @readonly
     */
    public get isPaused(): Signal<boolean> {
        return this._isPaused;
    }

    /**
     * Indicates whether encoded recording is active or paused.
     *
     * @public
     * @readonly
     */
    public get isRecording(): Signal<boolean> {
        return this._isRecording;
    }

    /**
     * Most recently emitted bounded audio fragment.
     *
     * @public
     * @readonly
     */
    public get latestChunk(): Signal<IAudioRecorderChunk | null> {
        return this._latestChunk.asReadonly();
    }

    /**
     * Owned live microphone stream for waveform analysis or WebRTC transport.
     *
     * @public
     * @readonly
     */
    public get mediaStream(): Signal<MediaStream | null> {
        return this._mediaStream.asReadonly();
    }

    /**
     * Effective encoded MIME type of the current or last completed recording.
     *
     * @public
     * @readonly
     */
    public get mimeType(): Signal<string | null> {
        return this._mimeType.asReadonly();
    }

    /**
     * Successful recording completions, including memory-free streamed recordings.
     *
     * @public
     * @readonly
     */
    public get recordingCompleted(): Observable<IAudioRecordingResult> {
        return this._recordingCompleted;
    }

    /**
     * Metadata of the last successful recording completion.
     *
     * @public
     * @readonly
     */
    public get recordingResult(): Signal<IAudioRecordingResult | null> {
        return this._recordingResult.asReadonly();
    }

    /**
     * Current recorder lifecycle state.
     *
     * @public
     * @readonly
     */
    public get state(): Signal<AudioRecorderState> {
        return this._state.asReadonly();
    }

    // #endregion

    // #region Methods

    /**
     * Starts microphone capture and immediately requests periodic encoded chunks.
     *
     * @param options - Microphone, encoding, chunking, and retention options.
     * @public
     */
    public async start(options: IAudioRecorderStartOptions = {}): Promise<void> {
        this.ensureStartAllowed();

        const normalizedOptions = this.normalizeStartOptions(options);
        const generation = ++this._generation;

        this.prepareRecording(normalizedOptions);
        this._state.set('acquiring');

        let mediaStream: MediaStream;

        try {
            this.ensureSupport();
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: normalizedOptions.audioConstraints
            });
        } catch (error: unknown) {
            const recorderError = this.mapCaptureError(error);

            if (generation !== this._generation) {
                return;
            }

            this.failStart(recorderError);
            throw recorderError;
        }

        if (generation !== this._generation || this._state() === 'disposed') {
            this.stopTracks(mediaStream);
            return;
        }

        try {
            const mediaRecorder = this.createMediaRecorder(mediaStream, normalizedOptions);

            this._mediaRecorder = mediaRecorder;
            this._mediaStream.set(mediaStream);
            this._mimeType.set(
                mediaRecorder.mimeType || this.pickSupportedMimeType(normalizedOptions.preferredMimeTypes) || null
            );
            this.attachRecorderEvents(mediaRecorder, generation);
            this._startedAtMs = this.now();
            mediaRecorder.start(normalizedOptions.chunkIntervalMs);
            this._state.set('recording');
            this.startTimer();
        } catch (error: unknown) {
            const recorderError = this.toRecorderFailure(error);

            if (generation === this._generation) {
                this.failStart(recorderError, mediaStream);
            } else {
                this.stopTracks(mediaStream);
            }

            throw recorderError;
        }
    }

    /**
     * Pauses encoding while keeping the microphone stream available to other consumers.
     *
     * @public
     */
    public pause(): void {
        if (this._state() !== 'recording' || !this._mediaRecorder) {
            return;
        }

        const now = this.now();

        try {
            this._mediaRecorder.pause();
            this.updateDuration(now);
            this._pauseStartedAtMs = now;
            this._state.set('paused');
            this.stopTimer();
        } catch (error: unknown) {
            throw this.failRecorder(error);
        }
    }

    /**
     * Resumes encoding after a pause.
     *
     * @public
     */
    public resume(): void {
        if (this._state() !== 'paused' || !this._mediaRecorder) {
            return;
        }

        const now = this.now();

        try {
            this._mediaRecorder.resume();
            this._pausedDurationMs += Math.max(0, now - this._pauseStartedAtMs);
            this._pauseStartedAtMs = 0;
            this._state.set('recording');
            this.updateDuration(now);
            this.startTimer();
        } catch (error: unknown) {
            throw this.failRecorder(error);
        }
    }

    /**
     * Requests an additional chunk without ending the recording.
     *
     * @public
     */
    public requestData(): void {
        if (!this._mediaRecorder || (this._state() !== 'recording' && this._state() !== 'paused')) {
            return;
        }

        try {
            this._mediaRecorder.requestData();
        } catch (error: unknown) {
            throw this.failRecorder(error);
        }
    }

    /**
     * Mutes or unmutes the owned microphone tracks without changing the session timeline.
     *
     * @param muted - True to emit silent audio frames while keeping tracks alive.
     * @public
     */
    public setMuted(muted: boolean): void {
        const mediaStream = this._mediaStream();

        if (!mediaStream) {
            return;
        }

        for (const track of mediaStream.getAudioTracks()) {
            track.enabled = !muted;
        }

        this._isMuted.set(muted);
    }

    /**
     * Stops recording after the browser has delivered its final chunk.
     *
     * @public
     * @returns Completion metadata, or null when no recording was active.
     */
    public stop(): Promise<IAudioRecordingResult | null> {
        if (this._state() === 'acquiring') {
            this.cancelAcquisition();
            return Promise.resolve(null);
        }

        if (this._state() === 'stopping') {
            return this._completionPromise ?? Promise.resolve(null);
        }

        if ((this._state() !== 'recording' && this._state() !== 'paused') || !this._mediaRecorder) {
            return Promise.resolve(null);
        }

        const completionPromise = this.createCompletionPromise();
        const now = this.now();

        if (this._state() === 'paused') {
            this._pausedDurationMs += Math.max(0, now - this._pauseStartedAtMs);
            this._pauseStartedAtMs = 0;
        }

        this.updateDuration(now);
        this.stopTimer();
        this._state.set('stopping');

        try {
            this._mediaRecorder.stop();
        } catch (error: unknown) {
            this.failRecorder(error);
        }

        return completionPromise;
    }

    /**
     * Ends the active session and discards all retained recording output.
     *
     * @public
     */
    public async cancel(): Promise<void> {
        if (this._state() === 'disposed') {
            return;
        }

        this._discardResult = true;

        try {
            if (this._state() === 'acquiring') {
                this.cancelAcquisition();
            } else if (this._state() === 'recording' || this._state() === 'paused' || this._state() === 'stopping') {
                await this.stop();
            } else {
                this.releaseRuntimeResources(true);
            }
        } finally {
            this.clearRecordingResult();
            this._durationMs.set(0);
            this._error.set(null);
            this._latestChunk.set(null);
            this._mimeType.set(null);
            this._discardResult = false;

            if (this._state() !== 'disposed') {
                this._state.set('idle');
            }
        }
    }

    /**
     * Transcribes the retained recording using the configured strategy.
     *
     * @param filename - Optional filename passed to the transcription strategy.
     * @public
     * @returns Transcribed text.
     */
    public async transcribe(filename?: string): Promise<string> {
        const blob = this._audioBlob();

        if (!blob) {
            throw new Error('No retained audio is available. Record with memory retention first.');
        }

        if (!this._transcriber) {
            throw new Error('Transcription is not available because no voice transcriber is registered.');
        }

        return this._transcriber.transcribe({
            blob,
            filename: filename ?? 'voice.webm',
            mimeType: blob.type || this._mimeType() || 'audio/webm'
        });
    }

    /**
     * Indicates whether required browser recording APIs are currently available.
     *
     * @public
     * @returns True when microphone acquisition and MediaRecorder are supported.
     */
    public isSupported(): boolean {
        return (
            typeof navigator !== 'undefined' &&
            Boolean(navigator.mediaDevices?.getUserMedia) &&
            typeof MediaRecorder !== 'undefined'
        );
    }

    /**
     * Releases browser resources immediately and permanently closes this recorder instance.
     *
     * @public
     */
    public dispose(): void {
        if (this._state() === 'disposed') {
            return;
        }

        this._generation += 1;
        this._discardResult = true;
        this.stopTimer();
        this.releaseRuntimeResources(true);
        this.resolveCompletion(null);
        this.clearRecordingResult();
        this._durationMs.set(0);
        this._error.set(null);
        this._latestChunk.set(null);
        this._mimeType.set(null);
        this._recordingCompletedSubject.complete();
        this._chunkAvailableSubject.complete();
        this._state.set('disposed');
    }

    /**
     * Attaches lifecycle handlers scoped to the active recorder generation.
     *
     * @param mediaRecorder - Browser recorder receiving lifecycle handlers.
     * @param generation - Active generation used to ignore stale browser events.
     * @private
     */
    private attachRecorderEvents(mediaRecorder: MediaRecorder, generation: number): void {
        mediaRecorder.ondataavailable = (event: BlobEvent): void => {
            this.onDataAvailable(mediaRecorder, generation, event);
        };
        mediaRecorder.onerror = (event: Event): void => {
            this.onRecorderError(mediaRecorder, generation, event as IMediaRecorderFailureEvent);
        };
        mediaRecorder.onstop = (): void => {
            this.onRecorderStop(mediaRecorder, generation);
        };
    }

    /**
     * Invalidates a pending microphone request that cannot be natively aborted.
     *
     * @private
     */
    private cancelAcquisition(): void {
        this._generation += 1;
        this._state.set('idle');
    }

    /**
     * Clears retained payloads and revokes their object URL.
     *
     * @private
     */
    private clearRecordingResult(): void {
        this.revokeAudioUrl();

        this._audioBlob.set(null);
        this._audioUrl.set(null);
        this._recordingResult.set(null);
    }

    /**
     * Creates a browser recorder using the first supported preferred MIME type.
     *
     * @param mediaStream - Owned microphone stream.
     * @param options - Normalized encoding options.
     * @private
     * @returns Configured browser recorder.
     */
    private createMediaRecorder(
        mediaStream: MediaStream,
        options: INormalizedAudioRecorderStartOptions
    ): MediaRecorder {
        const mimeType = this.pickSupportedMimeType(options.preferredMimeTypes);
        const recorderOptions: MediaRecorderOptions = {
            audioBitsPerSecond: options.audioBitsPerSecond
        };

        if (mimeType) {
            recorderOptions.mimeType = mimeType;
        }

        return new MediaRecorder(mediaStream, recorderOptions);
    }

    /**
     * Creates the shared completion promise used by repeated stop calls.
     *
     * @private
     * @returns Pending recording completion.
     */
    private createCompletionPromise(): Promise<IAudioRecordingResult | null> {
        const completionPromise = new Promise<IAudioRecordingResult | null>((resolve, reject) => {
            this._resolveCompletion = resolve;
            this._rejectCompletion = reject;
        });

        this._completionPromise = completionPromise;
        return completionPromise;
    }

    /**
     * Verifies that a new session cannot replace active browser resources.
     *
     * @private
     */
    private ensureStartAllowed(): void {
        if (this._state() === 'disposed') {
            throw new AudioRecorderError('invalid-state', 'The audio recorder has been disposed.');
        }

        if (this._state() !== 'idle' && this._state() !== 'error') {
            throw new AudioRecorderError(
                'invalid-state',
                `Cannot start audio recording while state is ${this._state()}.`
            );
        }
    }

    /**
     * Verifies that required browser audio APIs exist.
     *
     * @private
     */
    private ensureSupport(): void {
        if (!this.isSupported()) {
            throw new AudioRecorderError(
                'unsupported',
                'Browser audio recording requires MediaDevices.getUserMedia and MediaRecorder.'
            );
        }
    }

    /**
     * Converts a failed recorder operation into a terminal typed failure.
     *
     * @param error - Original browser failure.
     * @private
     * @returns Typed recorder failure.
     */
    private failRecorder(error: unknown): AudioRecorderError {
        const recorderError = this.toRecorderFailure(error);

        this.updateDuration(this.now());
        this.stopTimer();
        this.releaseRuntimeResources(true);
        this._error.set(recorderError);
        this._state.set('error');
        this.rejectCompletion(recorderError);

        return recorderError;
    }

    /**
     * Applies a failed start while releasing any partially acquired stream.
     *
     * @param error - Typed start failure.
     * @param mediaStream - Partially acquired stream when available.
     * @private
     */
    private failStart(error: AudioRecorderError, mediaStream?: MediaStream): void {
        if (mediaStream && this._mediaStream() !== mediaStream) {
            this.stopTracks(mediaStream);
        }

        this.releaseRuntimeResources(true);
        this._error.set(error);
        this._mimeType.set(null);
        this._state.set('error');
    }

    /**
     * Formats a millisecond duration without imposing a one-hour limit.
     *
     * @param durationMs - Duration to format.
     * @private
     * @returns `mm:ss` label.
     */
    private formatDuration(durationMs: number): string {
        const totalSeconds = Math.floor(Math.max(0, durationMs) / 1_000);
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');

        return `${minutes}:${seconds}`;
    }

    /**
     * Maps microphone acquisition failures to stable recovery categories.
     *
     * @param error - Browser acquisition failure.
     * @private
     * @returns Typed capture failure.
     */
    private mapCaptureError(error: unknown): AudioRecorderError {
        if (error instanceof AudioRecorderError) {
            return error;
        }

        const name = this.readErrorName(error);
        const code = this.mapCaptureErrorCode(name);
        const message = error instanceof Error ? error.message : 'Microphone acquisition failed.';

        return new AudioRecorderError(code, message || 'Microphone acquisition failed.', error);
    }

    /**
     * Converts browser error names into stable recorder categories.
     *
     * @param name - Browser error name.
     * @private
     * @returns Stable error category.
     */
    private mapCaptureErrorCode(name: string): AudioRecorderErrorCode {
        switch (name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'permission-denied';
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return 'device-not-found';
            case 'OverconstrainedError':
            case 'ConstraintNotSatisfiedError':
                return 'constraints-unsatisfied';
            case 'AbortError':
                return 'capture-aborted';
            default:
                return 'capture-failed';
        }
    }

    /**
     * Returns a monotonic timestamp for recording metadata.
     *
     * @private
     * @returns Monotonic milliseconds.
     */
    private now(): number {
        return performance.now();
    }

    /**
     * Normalizes and validates caller-controlled recording options.
     *
     * @param options - Raw start options.
     * @private
     * @returns Validated options.
     */
    private normalizeStartOptions(options: IAudioRecorderStartOptions): INormalizedAudioRecorderStartOptions {
        const audioBitsPerSecond = options.audioBitsPerSecond ?? DEFAULT_AUDIO_BITS_PER_SECOND;
        const chunkIntervalMs = options.chunkIntervalMs ?? DEFAULT_CHUNK_INTERVAL_MS;
        const preferredMimeTypes = options.preferredMimeTypes ?? DEFAULT_MIME_TYPES;
        const retention = options.retention ?? 'memory';

        if (!Number.isFinite(audioBitsPerSecond) || audioBitsPerSecond <= 0) {
            throw new RangeError('audioBitsPerSecond must be a positive finite number.');
        }

        if (!Number.isFinite(chunkIntervalMs) || chunkIntervalMs <= 0) {
            throw new RangeError('chunkIntervalMs must be a positive finite number.');
        }

        if (retention !== 'memory' && retention !== 'none') {
            throw new RangeError('retention must be either memory or none.');
        }

        if (preferredMimeTypes.some((mimeType) => !mimeType.trim())) {
            throw new RangeError('preferredMimeTypes cannot contain empty values.');
        }

        const audioConstraints: MediaTrackConstraints = {
            ...(options.audioConstraints ?? {})
        };

        if (options.audioDeviceId?.trim()) {
            audioConstraints.deviceId = { exact: options.audioDeviceId.trim() };
        }

        return {
            audioBitsPerSecond: Math.round(audioBitsPerSecond),
            audioConstraints,
            chunkIntervalMs: Math.round(chunkIntervalMs),
            preferredMimeTypes: Object.freeze([...preferredMimeTypes]),
            retention
        };
    }

    /**
     * Converts one browser data event into an ordered public chunk.
     *
     * @param mediaRecorder - Recorder that emitted the event.
     * @param generation - Recorder generation associated with the event.
     * @param event - Browser blob event.
     * @private
     */
    private onDataAvailable(mediaRecorder: MediaRecorder, generation: number, event: BlobEvent): void {
        if (generation !== this._generation || mediaRecorder !== this._mediaRecorder || event.data.size <= 0) {
            return;
        }

        this.updateDuration(this.now());

        const chunk: IAudioRecorderChunk = Object.freeze({
            blob: event.data,
            elapsedMs: this._durationMs(),
            mimeType: event.data.type || mediaRecorder.mimeType || 'audio/webm',
            sequence: this._chunkSequence,
            timecodeMs: Number.isFinite(event.timecode) ? event.timecode : null
        });

        this._chunkSequence += 1;

        if (this._currentOptions?.retention === 'memory') {
            this._retainedChunks.push(event.data);
        }

        this._latestChunk.set(chunk);
        this._chunkAvailableSubject.next(chunk);
    }

    /**
     * Converts an asynchronous browser encoder failure into recorder state.
     *
     * @param mediaRecorder - Recorder that emitted the failure.
     * @param generation - Recorder generation associated with the failure.
     * @param event - Browser failure event.
     * @private
     */
    private onRecorderError(mediaRecorder: MediaRecorder, generation: number, event: IMediaRecorderFailureEvent): void {
        if (generation !== this._generation || mediaRecorder !== this._mediaRecorder) {
            return;
        }

        this.failRecorder(event.error ?? new Error('MediaRecorder emitted an unknown error.'));
    }

    /**
     * Finalizes the current recording only after the browser emitted its last chunk.
     *
     * @param mediaRecorder - Recorder that stopped.
     * @param generation - Recorder generation associated with the event.
     * @private
     */
    private onRecorderStop(mediaRecorder: MediaRecorder, generation: number): void {
        if (generation !== this._generation || mediaRecorder !== this._mediaRecorder) {
            return;
        }

        const now = this.now();

        if (this._state() === 'paused') {
            this._pausedDurationMs += Math.max(0, now - this._pauseStartedAtMs);
            this._pauseStartedAtMs = 0;
        }

        this.updateDuration(now);
        this.stopTimer();

        const options = this._currentOptions;
        const mimeType = mediaRecorder.mimeType || this._mimeType() || 'audio/webm';
        let result: IAudioRecordingResult | null = null;

        if (!this._discardResult && options) {
            const blob = options.retention === 'memory' ? new Blob(this._retainedChunks, { type: mimeType }) : null;

            result = Object.freeze({
                blob,
                chunkCount: this._chunkSequence,
                durationMs: this._durationMs(),
                mimeType,
                retention: options.retention
            });

            this._recordingResult.set(result);
            this.setRecordingBlob(blob);
        }

        this.releaseRuntimeResources(false);
        this._discardResult = false;

        if (this._state() !== 'disposed') {
            this._state.set('idle');
        }

        if (result) {
            this._recordingCompletedSubject.next(result);
        }

        this.resolveCompletion(result);
    }

    /**
     * Selects the first MIME type supported by the browser recorder.
     *
     * @param preferredMimeTypes - Ordered MIME type preferences.
     * @private
     * @returns Supported MIME type, or undefined to use the browser default.
     */
    private pickSupportedMimeType(preferredMimeTypes: ReadonlyArray<string>): string | undefined {
        if (typeof MediaRecorder.isTypeSupported !== 'function') {
            return undefined;
        }

        return preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
    }

    /**
     * Clears previous output and initializes a bounded recording session.
     *
     * @param options - Normalized start options.
     * @private
     */
    private prepareRecording(options: INormalizedAudioRecorderStartOptions): void {
        this.clearRecordingResult();
        this._chunkSequence = 0;
        this._currentOptions = options;
        this._discardResult = false;
        this._durationMs.set(0);
        this._error.set(null);
        this._isMuted.set(false);
        this._latestChunk.set(null);
        this._mimeType.set(null);
        this._pauseStartedAtMs = 0;
        this._pausedDurationMs = 0;
        this._retainedChunks = [];
        this._startedAtMs = -1;
    }

    /**
     * Reads a browser error name without unsafe casts.
     *
     * @param error - Unknown browser failure.
     * @private
     * @returns Error name when available.
     */
    private readErrorName(error: unknown): string {
        if (typeof error !== 'object' || error === null || !('name' in error)) {
            return '';
        }

        const name = Reflect.get(error, 'name');

        return typeof name === 'string' ? name : '';
    }

    /**
     * Rejects and clears the pending stop completion.
     *
     * @param error - Failure delivered to stop callers.
     * @private
     */
    private rejectCompletion(error: AudioRecorderError): void {
        const reject = this._rejectCompletion;

        this._completionPromise = null;
        this._rejectCompletion = null;
        this._resolveCompletion = null;
        reject?.(error);
    }

    /**
     * Detaches browser callbacks and releases all owned live resources.
     *
     * @param stopRecorder - True to force-stop a still-active browser recorder.
     * @private
     */
    private releaseRuntimeResources(stopRecorder: boolean): void {
        const mediaRecorder = this._mediaRecorder;
        const mediaStream = this._mediaStream();

        if (mediaRecorder) {
            mediaRecorder.ondataavailable = null;
            mediaRecorder.onerror = null;
            mediaRecorder.onstop = null;

            if (stopRecorder && mediaRecorder.state !== 'inactive') {
                try {
                    mediaRecorder.stop();
                } catch {
                    /** The recorder is already unusable and its stream is released below. */
                }
            }
        }

        if (mediaStream) {
            this.stopTracks(mediaStream);
        }

        this._mediaRecorder = null;
        this._mediaStream.set(null);
        this._isMuted.set(false);
        this._currentOptions = null;
        this._pauseStartedAtMs = 0;
        this._pausedDurationMs = 0;
        this._retainedChunks = [];
        this._startedAtMs = -1;
    }

    /**
     * Resolves and clears the pending stop completion.
     *
     * @param result - Successful result or discarded completion.
     * @private
     */
    private resolveCompletion(result: IAudioRecordingResult | null): void {
        const resolve = this._resolveCompletion;

        this._completionPromise = null;
        this._rejectCompletion = null;
        this._resolveCompletion = null;
        resolve?.(result);
    }

    /**
     * Revokes the recording URL without letting a browser cleanup failure block recorder state.
     *
     * @private
     */
    private revokeAudioUrl(): void {
        const audioUrl = this._audioUrlValue;

        this._audioUrlValue = null;

        if (!audioUrl) {
            return;
        }

        try {
            URL.revokeObjectURL(audioUrl);
        } catch {
            /** The retained blob remains valid even when URL cleanup is unavailable. */
        }
    }

    /**
     * Stores a retained blob and manages its browser object URL.
     *
     * @param blob - Complete retained recording payload.
     * @private
     */
    private setRecordingBlob(blob: Blob | null): void {
        this.revokeAudioUrl();

        this._audioBlob.set(blob);

        if (!blob) {
            this._audioUrl.set(null);
            return;
        }

        try {
            this._audioUrlValue = URL.createObjectURL(blob);
            this._audioUrl.set(this._audioUrlValue);
        } catch {
            this._audioUrlValue = null;
            this._audioUrl.set(null);
        }
    }

    /**
     * Starts the duration ticker without affecting media chunk timing.
     *
     * @private
     */
    private startTimer(): void {
        if (this._timerId !== null) {
            return;
        }

        this._timerId = globalThis.setInterval(() => this.updateDuration(this.now()), 200);
    }

    /**
     * Stops every track owned by the recorder.
     *
     * @param mediaStream - Owned stream to close.
     * @private
     */
    private stopTracks(mediaStream: MediaStream): void {
        for (const track of mediaStream.getTracks()) {
            try {
                track.stop();
            } catch {
                /** Continue releasing remaining tracks after a browser cleanup failure. */
            }
        }
    }

    /**
     * Stops the duration ticker.
     *
     * @private
     */
    private stopTimer(): void {
        if (this._timerId === null) {
            return;
        }

        globalThis.clearInterval(this._timerId);
        this._timerId = null;
    }

    /**
     * Wraps an encoding failure in a stable recorder category.
     *
     * @param error - Browser encoding failure.
     * @private
     * @returns Typed recorder failure.
     */
    private toRecorderFailure(error: unknown): AudioRecorderError {
        if (error instanceof AudioRecorderError) {
            return error;
        }

        const message = error instanceof Error ? error.message : 'Browser audio encoding failed.';

        return new AudioRecorderError('recorder-failed', message || 'Browser audio encoding failed.', error);
    }

    /**
     * Refreshes active duration from monotonic browser time.
     *
     * @param now - Current monotonic timestamp.
     * @private
     */
    private updateDuration(now: number): void {
        if (this._startedAtMs < 0) {
            return;
        }

        const activePause = this._state() === 'paused' ? Math.max(0, now - this._pauseStartedAtMs) : 0;
        const elapsed = now - this._startedAtMs - this._pausedDurationMs - activePause;

        this._durationMs.set(Math.max(0, elapsed));
    }

    // #endregion
}
