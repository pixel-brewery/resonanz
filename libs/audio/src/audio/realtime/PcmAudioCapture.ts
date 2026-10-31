// #region Imports

import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { RealtimeAudioError } from './errors/RealtimeAudioError';
import type { IPcmAudioCaptureStartOptions } from './models/IPcmAudioCaptureStartOptions';
import type { IPcmAudioFormat } from './models/IPcmAudioFormat';
import type { IPcmAudioFrame } from './models/IPcmAudioFrame';
import type { PcmAudioCaptureState } from './models/PcmAudioCaptureState';
import { PcmAudioFormatPolicy } from './PcmAudioFormatPolicy';
import { PCM_AUDIO_WORKLET_DEFINITION } from './worklets/PcmAudioWorkletDefinition';
import { RealtimeAudioWorkletModuleLoader } from './worklets/RealtimeAudioWorkletModuleLoader';

// #endregion

interface IAudioContextGlobal {
    readonly AudioContext?: typeof AudioContext;
    readonly webkitAudioContext?: typeof AudioContext;
}

interface INormalizedPcmAudioCaptureStartOptions {
    readonly format: Readonly<IPcmAudioFormat>;
    readonly frameDurationMs: number;
    readonly samplesPerFrame: number;
}

interface IPcmCaptureFrameMessage {
    readonly data: ArrayBuffer;
    readonly sampleCount: number;
    readonly type: 'frame';
}

interface IPcmCaptureFlushedMessage {
    readonly requestId: number;
    readonly type: 'flushed';
}

interface IPendingCaptureFlush {
    readonly promise: Promise<void>;
    readonly reject: (reason?: unknown) => void;
    readonly requestId: number;
    readonly resolve: () => void;
    readonly timeoutId: ReturnType<typeof globalThis.setTimeout>;
}

const DEFAULT_FRAME_DURATION_MS = 20;
const MAX_FRAME_DURATION_MS = 1_000;
const MIN_FRAME_DURATION_MS = 5;
const WORKLET_COMMAND_TIMEOUT_MS = 2_000;

/**
 * Converts an externally owned live media stream into bounded PCM frames for realtime transports.
 *
 * The capture owns its Web Audio graph but never stops or mutates the supplied media tracks.
 *
 * @public
 */
export class PcmAudioCapture {
    // #region Fields

    private readonly _destroyRef: DestroyRef = inject(DestroyRef);
    private readonly _error = signal<RealtimeAudioError | null>(null);
    private readonly _format = signal<Readonly<IPcmAudioFormat> | null>(null);
    private readonly _frameAvailableSubject = new Subject<IPcmAudioFrame>();
    private readonly _frameAvailable = this._frameAvailableSubject.asObservable();
    private readonly _isActive = computed<boolean>(() => {
        const state = this._state();

        return state === 'starting' || state === 'capturing' || state === 'paused' || state === 'stopping';
    });
    private readonly _latestFrame = signal<IPcmAudioFrame | null>(null);
    private readonly _mediaStream = signal<MediaStream | null>(null);
    private readonly _state = signal<PcmAudioCaptureState>('idle');
    private readonly _workletModuleLoader: RealtimeAudioWorkletModuleLoader;
    private _audioContext: AudioContext | null = null;
    private _emittedSampleCount = 0;
    private _generation = 0;
    private _pendingFlush: IPendingCaptureFlush | null = null;
    private _processorErrorHandler: EventListener | null = null;
    private _resolveStartSettlement: (() => void) | null = null;
    private _sequence = 0;
    private _silentGainNode: GainNode | null = null;
    private _sourceNode: MediaStreamAudioSourceNode | null = null;
    private _startSettlementPromise: Promise<void> | null = null;
    private _startedAtMs = 0;
    private _stopPromise: Promise<void> | null = null;
    private _trackEndedHandler: EventListener | null = null;
    private _trackedAudioTracks: MediaStreamTrack[] = [];
    private _workletNode: AudioWorkletNode | null = null;

    // #endregion

    // #region Ctor

    /**
     * Creates a PCM capture using the configured worklet module source.
     *
     * @param workletModuleLoader - Loader responsible for registering browser worklet processors.
     * @public
     */
    public constructor(
        workletModuleLoader: RealtimeAudioWorkletModuleLoader = inject(RealtimeAudioWorkletModuleLoader)
    ) {
        this._workletModuleLoader = workletModuleLoader;
        this._destroyRef.onDestroy(() => this.dispose());
    }

    // #endregion

    // #region Properties

    /**
     * Last typed capture or browser worklet failure.
     *
     * @public
     * @readonly
     */
    public get error(): Signal<RealtimeAudioError | null> {
        return this._error.asReadonly();
    }

    /**
     * Effective PCM format of the active capture.
     *
     * @public
     * @readonly
     */
    public get format(): Signal<Readonly<IPcmAudioFormat> | null> {
        return this._format.asReadonly();
    }

    /**
     * Ordered PCM frames emitted while capture remains active.
     *
     * @public
     * @readonly
     */
    public get frameAvailable(): Observable<IPcmAudioFrame> {
        return this._frameAvailable;
    }

    /**
     * Indicates whether capture is starting, running, paused, or stopping.
     *
     * @public
     * @readonly
     */
    public get isActive(): Signal<boolean> {
        return this._isActive;
    }

    /**
     * Most recently emitted PCM frame.
     *
     * @public
     * @readonly
     */
    public get latestFrame(): Signal<IPcmAudioFrame | null> {
        return this._latestFrame.asReadonly();
    }

    /**
     * Externally owned media stream currently attached to the capture graph.
     *
     * @public
     * @readonly
     */
    public get mediaStream(): Signal<MediaStream | null> {
        return this._mediaStream.asReadonly();
    }

    /**
     * Current realtime PCM capture lifecycle.
     *
     * @public
     * @readonly
     */
    public get state(): Signal<PcmAudioCaptureState> {
        return this._state.asReadonly();
    }

    // #endregion

    // #region Methods

    /**
     * Starts PCM frame production from an externally owned audio stream.
     *
     * @param mediaStream - Live media stream whose tracks remain owned by the caller.
     * @param options - PCM format and frame duration options.
     * @public
     */
    public async start(mediaStream: MediaStream, options: IPcmAudioCaptureStartOptions = {}): Promise<void> {
        this.ensureStartAllowed();

        const normalizedOptions = this.normalizeStartOptions(options);
        const audioTracks = mediaStream.getAudioTracks();

        if (audioTracks.length === 0 || audioTracks.every((track) => track.readyState === 'ended')) {
            throw new RealtimeAudioError(
                'invalid-stream',
                'Realtime PCM capture requires at least one live audio track.'
            );
        }

        const generation = ++this._generation;

        this._error.set(null);
        this._format.set(normalizedOptions.format);
        this._latestFrame.set(null);
        this._mediaStream.set(mediaStream);
        this._emittedSampleCount = 0;
        this._sequence = 0;
        this._startedAtMs = this.now();
        this._state.set('starting');
        this.createStartSettlement();

        try {
            this.ensureSupport();

            const audioContext = this.createAudioContext(normalizedOptions.format);

            this._audioContext = audioContext;
            await this.loadWorkletModule(audioContext);

            if (generation !== this._generation || this._state() === 'disposed') {
                await this.releaseRuntimeResources();
                return;
            }

            this.createCaptureGraph(audioContext, mediaStream, normalizedOptions, generation);
            this.attachTrackListeners(audioTracks, generation);

            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            if (generation !== this._generation || this._state() === 'disposed') {
                await this.releaseRuntimeResources();
                return;
            }

            this._state.set('capturing');
        } catch (error: unknown) {
            if (generation !== this._generation || this._state() === 'disposed') {
                await this.releaseRuntimeResources();
                return;
            }

            const captureError = this.toCaptureError(error);

            await this.releaseRuntimeResources();
            this._error.set(captureError);
            this._state.set('error');
            throw captureError;
        } finally {
            this.resolveStartSettlement();
        }
    }

    /**
     * Suspends PCM processing while retaining the external stream and worklet graph.
     *
     * @public
     */
    public async pause(): Promise<void> {
        if (this._state() !== 'capturing' || !this._audioContext) {
            return;
        }

        try {
            await this._audioContext.suspend();
            this._state.set('paused');
        } catch (error: unknown) {
            const captureError = this.failCapture(error);

            throw captureError;
        }
    }

    /**
     * Resumes PCM processing after a pause.
     *
     * @public
     */
    public async resume(): Promise<void> {
        if (this._state() !== 'paused' || !this._audioContext) {
            return;
        }

        try {
            await this._audioContext.resume();
            this._state.set('capturing');
        } catch (error: unknown) {
            const captureError = this.failCapture(error);

            throw captureError;
        }
    }

    /**
     * Flushes the final partial PCM frame and releases the Web Audio graph.
     *
     * @public
     */
    public stop(): Promise<void> {
        if (this._state() === 'starting') {
            this._generation += 1;
            this._state.set('stopping');

            const startSettlementPromise = this._startSettlementPromise ?? Promise.resolve();
            const stopPromise = Promise.all([this.releaseRuntimeResources(), startSettlementPromise]).then(() =>
                this.resetSessionState()
            );

            this._stopPromise = stopPromise;
            return stopPromise;
        }

        if (this._state() === 'stopping') {
            return this._stopPromise ?? Promise.resolve();
        }

        if (this._state() !== 'capturing' && this._state() !== 'paused') {
            return Promise.resolve();
        }

        this._state.set('stopping');
        const stopPromise = this.stopActiveCapture();

        this._stopPromise = stopPromise;
        return stopPromise;
    }

    /**
     * Indicates whether required Web Audio and AudioWorklet APIs are available.
     *
     * @public
     * @returns True when realtime PCM capture can be initialized.
     */
    public isSupported(): boolean {
        return this.resolveAudioContextConstructor() !== null && typeof globalThis.AudioWorkletNode === 'function';
    }

    /**
     * Permanently releases worklet resources without stopping externally owned media tracks.
     *
     * @public
     */
    public dispose(): void {
        if (this._state() === 'disposed') {
            return;
        }

        this._generation += 1;
        this.rejectPendingFlush(
            new RealtimeAudioError('invalid-state', 'Realtime PCM capture was disposed before flushing completed.')
        );
        void this.releaseRuntimeResources();
        this._frameAvailableSubject.complete();
        this._format.set(null);
        this._latestFrame.set(null);
        this._mediaStream.set(null);
        this._state.set('disposed');
    }

    private attachTrackListeners(audioTracks: MediaStreamTrack[], generation: number): void {
        this.detachTrackListeners();

        this._trackEndedHandler = (): void => this.onTrackEnded(generation);
        this._trackedAudioTracks = [...audioTracks];

        for (const track of this._trackedAudioTracks) {
            track.addEventListener('ended', this._trackEndedHandler);
        }
    }

    private createAudioContext(format: IPcmAudioFormat): AudioContext {
        const AudioContextConstructor = this.resolveAudioContextConstructor();

        if (!AudioContextConstructor) {
            throw new RealtimeAudioError('unsupported', 'The Web Audio API is unavailable.');
        }

        const audioContext = new AudioContextConstructor({
            latencyHint: 'interactive',
            sampleRate: format.sampleRateHz
        });

        if (audioContext.sampleRate !== format.sampleRateHz) {
            void audioContext.close();
            throw new RealtimeAudioError(
                'invalid-format',
                `The browser created a ${audioContext.sampleRate} Hz context instead of ${format.sampleRateHz} Hz.`
            );
        }

        if (!audioContext.audioWorklet?.addModule) {
            void audioContext.close();
            throw new RealtimeAudioError('unsupported', 'The AudioWorklet API is unavailable.');
        }

        return audioContext;
    }

    private createStartSettlement(): void {
        this._startSettlementPromise = new Promise<void>((resolve) => {
            this._resolveStartSettlement = resolve;
        });
    }

    private createCaptureGraph(
        audioContext: AudioContext,
        mediaStream: MediaStream,
        options: INormalizedPcmAudioCaptureStartOptions,
        generation: number
    ): void {
        const sourceNode = audioContext.createMediaStreamSource(mediaStream);
        const workletNode = new AudioWorkletNode(audioContext, PCM_AUDIO_WORKLET_DEFINITION.captureProcessorName, {
            channelCount: options.format.channelCount,
            channelCountMode: 'explicit',
            channelInterpretation: 'speakers',
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            processorOptions: {
                channelCount: options.format.channelCount,
                samplesPerFrame: options.samplesPerFrame
            }
        });
        const silentGainNode = audioContext.createGain();

        silentGainNode.gain.value = 0;
        workletNode.port.onmessage = (event: MessageEvent<unknown>): void =>
            this.onWorkletMessage(generation, event.data);
        workletNode.port.onmessageerror = (): void => {
            this.onWorkletFailure(generation, new Error('PCM capture worklet message decoding failed.'));
        };
        this._processorErrorHandler = (): void => {
            this.onWorkletFailure(generation, new Error('PCM capture worklet processor failed.'));
        };
        workletNode.addEventListener('processorerror', this._processorErrorHandler);

        sourceNode.connect(workletNode);
        workletNode.connect(silentGainNode);
        silentGainNode.connect(audioContext.destination);

        this._sourceNode = sourceNode;
        this._workletNode = workletNode;
        this._silentGainNode = silentGainNode;
    }

    private detachTrackListeners(): void {
        if (this._trackEndedHandler) {
            for (const track of this._trackedAudioTracks) {
                track.removeEventListener('ended', this._trackEndedHandler);
            }
        }

        this._trackEndedHandler = null;
        this._trackedAudioTracks = [];
    }

    private ensureStartAllowed(): void {
        if (this._state() === 'disposed') {
            throw new RealtimeAudioError('invalid-state', 'Realtime PCM capture has been disposed.');
        }

        if (this._state() !== 'idle' && this._state() !== 'error') {
            throw new RealtimeAudioError(
                'invalid-state',
                `Cannot start realtime PCM capture while state is ${this._state()}.`
            );
        }
    }

    private ensureSupport(): void {
        if (!this.isSupported()) {
            throw new RealtimeAudioError(
                'unsupported',
                'Realtime PCM capture requires AudioContext and AudioWorkletNode.'
            );
        }
    }

    private failCapture(error: unknown): RealtimeAudioError {
        const captureError = this.toCaptureError(error);

        this._generation += 1;
        this.rejectPendingFlush(captureError);
        void this.releaseRuntimeResources();
        this._error.set(captureError);
        this._state.set('error');

        return captureError;
    }

    private isFlushedMessage(message: unknown): message is IPcmCaptureFlushedMessage {
        return (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            message.type === 'flushed' &&
            'requestId' in message &&
            typeof message.requestId === 'number'
        );
    }

    private isFrameMessage(message: unknown): message is IPcmCaptureFrameMessage {
        return (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            message.type === 'frame' &&
            'data' in message &&
            message.data instanceof ArrayBuffer &&
            'sampleCount' in message &&
            Number.isSafeInteger(message.sampleCount) &&
            Number(message.sampleCount) > 0
        );
    }

    private async loadWorkletModule(audioContext: AudioContext): Promise<void> {
        try {
            await this._workletModuleLoader.load(audioContext);
        } catch (error: unknown) {
            throw new RealtimeAudioError('worklet-load-failed', 'Realtime PCM processors could not be loaded.', error);
        }
    }

    private normalizeStartOptions(options: IPcmAudioCaptureStartOptions): INormalizedPcmAudioCaptureStartOptions {
        let format: Readonly<IPcmAudioFormat>;

        try {
            format = PcmAudioFormatPolicy.normalize(options.format);
        } catch (error: unknown) {
            throw new RealtimeAudioError('invalid-format', 'The requested PCM capture format is invalid.', error);
        }

        const frameDurationMs = options.frameDurationMs ?? DEFAULT_FRAME_DURATION_MS;

        if (
            !Number.isFinite(frameDurationMs) ||
            frameDurationMs < MIN_FRAME_DURATION_MS ||
            frameDurationMs > MAX_FRAME_DURATION_MS
        ) {
            throw new RealtimeAudioError(
                'invalid-format',
                `PCM frameDurationMs must be between ${MIN_FRAME_DURATION_MS} and ${MAX_FRAME_DURATION_MS}.`
            );
        }

        return {
            format,
            frameDurationMs,
            samplesPerFrame: Math.max(1, Math.round((format.sampleRateHz * frameDurationMs) / 1_000))
        };
    }

    private now(): number {
        return performance.now();
    }

    private onTrackEnded(generation: number): void {
        if (
            generation !== this._generation ||
            (this._state() !== 'capturing' && this._state() !== 'paused') ||
            this._trackedAudioTracks.some((track) => track.readyState !== 'ended')
        ) {
            return;
        }

        this.failCapture(new RealtimeAudioError('invalid-stream', 'All realtime PCM audio tracks have ended.'));
    }

    private onWorkletFailure(generation: number, error: unknown): void {
        if (generation !== this._generation || this._state() === 'disposed') {
            return;
        }

        this.failCapture(error);
    }

    private onWorkletMessage(generation: number, message: unknown): void {
        if (generation !== this._generation || this._state() === 'disposed') {
            return;
        }

        if (this.isFrameMessage(message)) {
            this.publishFrame(message);
            return;
        }

        if (this.isFlushedMessage(message)) {
            this.resolvePendingFlush(message.requestId);
        }
    }

    private publishFrame(message: IPcmCaptureFrameMessage): void {
        const format = this._format();

        if (!format) {
            return;
        }

        const expectedByteLength = message.sampleCount * format.channelCount * 2;

        if (message.data.byteLength !== expectedByteLength) {
            this.failCapture(
                new RealtimeAudioError('capture-failed', 'PCM capture worklet emitted a misaligned payload.')
            );
            return;
        }

        const durationMs = (message.sampleCount / format.sampleRateHz) * 1_000;
        const frame: IPcmAudioFrame = {
            data: message.data,
            durationMs,
            format,
            sequence: this._sequence,
            timestampMs: this._startedAtMs + (this._emittedSampleCount / format.sampleRateHz) * 1_000
        };

        this._sequence += 1;
        this._emittedSampleCount += message.sampleCount;
        this._latestFrame.set(frame);
        this._frameAvailableSubject.next(frame);
    }

    private rejectPendingFlush(reason: unknown): void {
        const pendingFlush = this._pendingFlush;

        if (!pendingFlush) {
            return;
        }

        globalThis.clearTimeout(pendingFlush.timeoutId);
        this._pendingFlush = null;
        pendingFlush.reject(reason);
    }

    private async releaseRuntimeResources(): Promise<void> {
        this.detachTrackListeners();

        const workletNode = this._workletNode;

        if (workletNode) {
            workletNode.port.onmessage = null;
            workletNode.port.onmessageerror = null;

            if (this._processorErrorHandler) {
                workletNode.removeEventListener('processorerror', this._processorErrorHandler);
            }
        }

        this._processorErrorHandler = null;

        try {
            this._sourceNode?.disconnect();
        } catch {
            /** Browser nodes can already be disconnected during page teardown. */
        }

        try {
            this._workletNode?.disconnect();
        } catch {
            /** Browser nodes can already be disconnected during page teardown. */
        }

        try {
            this._silentGainNode?.disconnect();
        } catch {
            /** Browser nodes can already be disconnected during page teardown. */
        }

        this._sourceNode = null;
        this._workletNode = null;
        this._silentGainNode = null;

        const audioContext = this._audioContext;

        this._audioContext = null;
        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close().catch(() => undefined);
        }

        this._mediaStream.set(null);
    }

    private resetSessionState(): void {
        this._format.set(null);
        this._latestFrame.set(null);
        this._mediaStream.set(null);
        this._stopPromise = null;

        if (this._state() !== 'disposed') {
            this._state.set('idle');
        }
    }

    private resolveAudioContextConstructor(): typeof AudioContext | null {
        const audioGlobal = globalThis as unknown as IAudioContextGlobal;

        return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext ?? null;
    }

    private resolveStartSettlement(): void {
        this._resolveStartSettlement?.();
        this._resolveStartSettlement = null;
        this._startSettlementPromise = null;
    }

    private resolvePendingFlush(requestId: number): void {
        const pendingFlush = this._pendingFlush;

        if (!pendingFlush || pendingFlush.requestId !== requestId) {
            return;
        }

        globalThis.clearTimeout(pendingFlush.timeoutId);
        this._pendingFlush = null;
        pendingFlush.resolve();
    }

    private async stopActiveCapture(): Promise<void> {
        try {
            if (this._audioContext?.state === 'suspended') {
                await this._audioContext.resume();
            }

            await this.requestFlush();
            await this.releaseRuntimeResources();
            this.resetSessionState();
        } catch (error: unknown) {
            const captureError = this.toCaptureError(error);

            await this.releaseRuntimeResources();
            this._error.set(captureError);
            this._state.set('error');
            this._stopPromise = null;
            throw captureError;
        }
    }

    private requestFlush(): Promise<void> {
        const workletNode = this._workletNode;

        if (!workletNode) {
            return Promise.resolve();
        }

        const requestId = this._generation;
        let rejectPromise: (reason?: unknown) => void = () => undefined;
        let resolvePromise: () => void = () => undefined;
        const promise = new Promise<void>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        const timeoutId = globalThis.setTimeout(() => {
            this.rejectPendingFlush(
                new RealtimeAudioError('worklet-timeout', 'PCM capture worklet did not flush before the timeout.')
            );
        }, WORKLET_COMMAND_TIMEOUT_MS);

        this._pendingFlush = {
            promise,
            reject: rejectPromise,
            requestId,
            resolve: resolvePromise,
            timeoutId
        };
        workletNode.port.postMessage({ type: 'flush', requestId });

        return promise;
    }

    private toCaptureError(error: unknown): RealtimeAudioError {
        if (error instanceof RealtimeAudioError) {
            return error;
        }

        const message = error instanceof Error && error.message ? error.message : 'Realtime PCM capture failed.';

        return new RealtimeAudioError('capture-failed', message, error);
    }

    // #endregion
}
