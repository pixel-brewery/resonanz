// #region Imports

import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { RealtimeAudioError } from './errors/RealtimeAudioError';
import type { IPcmAudioFormat } from './models/IPcmAudioFormat';
import type { IPcmAudioFrame } from './models/IPcmAudioFrame';
import type { IPcmAudioStreamPlayerStartOptions } from './models/IPcmAudioStreamPlayerStartOptions';
import type { PcmAudioStreamPlayerState } from './models/PcmAudioStreamPlayerState';
import { PcmAudioFormatPolicy } from './PcmAudioFormatPolicy';
import { PCM_AUDIO_WORKLET_DEFINITION } from './worklets/PcmAudioWorkletDefinition';
import { RealtimeAudioWorkletModuleLoader } from './worklets/RealtimeAudioWorkletModuleLoader';

// #endregion

interface IAudioContextGlobal {
    readonly AudioContext?: typeof AudioContext;
    readonly webkitAudioContext?: typeof AudioContext;
}

interface INormalizedPcmAudioStreamPlayerStartOptions {
    readonly format: Readonly<IPcmAudioFormat>;
    readonly initialBufferDurationMs: number;
    readonly initialBufferSampleCount: number;
    readonly maxBufferDurationMs: number;
    readonly maxBufferSampleCount: number;
    readonly volume: number;
}

interface IPendingPlayerCommand {
    readonly promise: Promise<void>;
    readonly reject: (reason?: unknown) => void;
    readonly requestId: number;
    readonly resolve: () => void;
    readonly timeoutId: ReturnType<typeof globalThis.setTimeout>;
}

interface IPlayerWorkletMessage {
    readonly type: string;
    readonly [key: string]: unknown;
}

const DEFAULT_INITIAL_BUFFER_DURATION_MS = 60;
const DEFAULT_MAX_BUFFER_DURATION_MS = 5_000;
const MAX_BUFFER_DURATION_MS = 60_000;
const WORKLET_COMMAND_GRACE_MS = 5_000;
const WORKLET_COMMAND_TIMEOUT_MS = 2_000;

/**
 * Plays ordered PCM frames through a bounded AudioWorklet jitter queue.
 *
 * The player owns its Web Audio graph and never depends on a transport, provider, or product session.
 *
 * @public
 */
export class PcmAudioStreamPlayer {
    // #region Fields

    private readonly _bufferedDurationMs = signal<number>(0);
    private readonly _destroyRef: DestroyRef = inject(DestroyRef);
    private readonly _error = signal<RealtimeAudioError | null>(null);
    private readonly _format = signal<Readonly<IPcmAudioFormat> | null>(null);
    private readonly _isActive = computed<boolean>(() => {
        const state = this._state();

        return state !== 'idle' && state !== 'error' && state !== 'disposed';
    });
    private readonly _isMuted = signal<boolean>(false);
    private readonly _isPlaying = computed<boolean>(() => {
        const state = this._state();

        return state === 'playing' || (state === 'draining' && this._bufferedDurationMs() > 0);
    });
    private readonly _state = signal<PcmAudioStreamPlayerState>('idle');
    private readonly _underrunCount = signal<number>(0);
    private readonly _volume = signal<number>(1);
    private readonly _workletModuleLoader: RealtimeAudioWorkletModuleLoader;
    private _audioContext: AudioContext | null = null;
    private _commandSequence = 0;
    private _gainNode: GainNode | null = null;
    private _generation = 0;
    private _lastSequence = -1;
    private _maxBufferDurationMs = DEFAULT_MAX_BUFFER_DURATION_MS;
    private _maxBufferSampleCount = 0;
    private _pendingClear: IPendingPlayerCommand | null = null;
    private _pendingDrain: IPendingPlayerCommand | null = null;
    private _processorErrorHandler: EventListener | null = null;
    private _queuedSampleCount = 0;
    private _resolveStartSettlement: (() => void) | null = null;
    private _startSettlementPromise: Promise<void> | null = null;
    private _stateBeforePause: PcmAudioStreamPlayerState = 'ready';
    private _workletNode: AudioWorkletNode | null = null;

    // #endregion

    // #region Ctor

    /**
     * Creates a PCM stream player using the configured worklet module source.
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
     * Approximate audio duration currently waiting in the playback queue.
     *
     * @public
     * @readonly
     */
    public get bufferedDurationMs(): Signal<number> {
        return this._bufferedDurationMs.asReadonly();
    }

    /**
     * Last typed playback or browser worklet failure.
     *
     * @public
     * @readonly
     */
    public get error(): Signal<RealtimeAudioError | null> {
        return this._error.asReadonly();
    }

    /**
     * PCM format accepted by the active playback graph.
     *
     * @public
     * @readonly
     */
    public get format(): Signal<Readonly<IPcmAudioFormat> | null> {
        return this._format.asReadonly();
    }

    /**
     * Indicates whether a playback graph currently owns browser resources.
     *
     * @public
     * @readonly
     */
    public get isActive(): Signal<boolean> {
        return this._isActive;
    }

    /**
     * Indicates whether output is muted without discarding queued frames.
     *
     * @public
     * @readonly
     */
    public get isMuted(): Signal<boolean> {
        return this._isMuted.asReadonly();
    }

    /**
     * Indicates whether queued PCM samples are currently being rendered.
     *
     * @public
     * @readonly
     */
    public get isPlaying(): Signal<boolean> {
        return this._isPlaying;
    }

    /**
     * Current bounded PCM playback lifecycle.
     *
     * @public
     * @readonly
     */
    public get state(): Signal<PcmAudioStreamPlayerState> {
        return this._state.asReadonly();
    }

    /**
     * Number of times playback exhausted its queue before an explicit flush.
     *
     * @public
     * @readonly
     */
    public get underrunCount(): Signal<number> {
        return this._underrunCount.asReadonly();
    }

    /**
     * Output volume in the inclusive range from zero to one.
     *
     * @public
     * @readonly
     */
    public get volume(): Signal<number> {
        return this._volume.asReadonly();
    }

    // #endregion

    // #region Methods

    /**
     * Initializes an empty bounded playback graph for one PCM format.
     *
     * @param options - Format, jitter-buffer, queue, and volume options.
     * @public
     */
    public async start(options: IPcmAudioStreamPlayerStartOptions = {}): Promise<void> {
        this.ensureStartAllowed();

        const normalizedOptions = this.normalizeStartOptions(options);
        const generation = ++this._generation;

        this._error.set(null);
        this._format.set(normalizedOptions.format);
        this._bufferedDurationMs.set(0);
        this._lastSequence = -1;
        this._maxBufferDurationMs = normalizedOptions.maxBufferDurationMs;
        this._maxBufferSampleCount = normalizedOptions.maxBufferSampleCount;
        this._queuedSampleCount = 0;
        this._underrunCount.set(0);
        this._volume.set(normalizedOptions.volume);
        this._state.set('starting');
        this.createStartSettlement();

        try {
            this.ensureSupport();

            const audioContext = this.createAudioContext(normalizedOptions.format);

            this._audioContext = audioContext;
            // Invoke resume before the first asynchronous boundary so browsers retain the
            // explicit user activation that started realtime playback.
            const resumePromise = audioContext.state === 'suspended' ? audioContext.resume() : Promise.resolve();
            await Promise.all([this.loadWorkletModule(audioContext), resumePromise]);

            if (generation !== this._generation || this._state() === 'disposed') {
                await this.releaseRuntimeResources();
                return;
            }

            this.createPlaybackGraph(audioContext, normalizedOptions, generation);
            this.applyGain();

            if (generation !== this._generation || this._state() === 'disposed') {
                await this.releaseRuntimeResources();
                return;
            }

            this._state.set('ready');
        } catch (error: unknown) {
            if (generation !== this._generation || this._state() === 'disposed') {
                await this.releaseRuntimeResources();
                return;
            }

            const playbackError = this.toPlaybackError(error);

            await this.releaseRuntimeResources();
            this._error.set(playbackError);
            this._state.set('error');
            throw playbackError;
        } finally {
            this.resolveStartSettlement();
        }
    }

    /**
     * Appends one ordered frame without retaining or transforming its caller-owned buffer.
     *
     * @param frame - PCM frame whose format must match the active graph.
     * @public
     */
    public append(frame: IPcmAudioFrame): void {
        const format = this.ensureAppendAllowed();
        const sampleCount = this.validateFrame(frame, format);

        if (this._queuedSampleCount + sampleCount > this._maxBufferSampleCount) {
            throw new RealtimeAudioError(
                'queue-overflow',
                `PCM playback queue would exceed ${this._maxBufferDurationMs} milliseconds.`
            );
        }

        const workletNode = this._workletNode;

        if (!workletNode) {
            throw new RealtimeAudioError('invalid-state', 'PCM playback graph is unavailable.');
        }

        const transferableData = frame.data.slice(0);

        try {
            workletNode.port.postMessage({ type: 'append', data: transferableData }, [transferableData]);
        } catch (error: unknown) {
            throw this.failPlayback(error);
        }

        this._lastSequence = frame.sequence;
        this._queuedSampleCount += sampleCount;
        this.updateBufferedDuration();

        if (this._state() === 'ready') {
            this._state.set('buffering');
        }
    }

    /**
     * Marks the current response complete and resolves after every queued sample has played.
     *
     * @public
     */
    public async flush(): Promise<void> {
        if (this._pendingDrain) {
            return this._pendingDrain.promise;
        }

        const workletNode = this.ensureControlAllowed();
        const wasPaused = this._state() === 'paused';

        if (wasPaused) {
            await this.resume();
        }

        const pendingDrain = this.createPendingCommand(this._maxBufferDurationMs + WORKLET_COMMAND_GRACE_MS);

        this._pendingDrain = pendingDrain;
        this._state.set('draining');
        workletNode.port.postMessage({ type: 'flush', requestId: pendingDrain.requestId });

        await pendingDrain.promise;
    }

    /**
     * Discards the current response immediately while keeping the playback graph reusable.
     *
     * @public
     */
    public async clear(): Promise<void> {
        if (this._pendingClear) {
            return this._pendingClear.promise;
        }

        const workletNode = this.ensureControlAllowed();
        const wasPaused = this._state() === 'paused';

        if (wasPaused) {
            await this.resume();
        }

        const pendingClear = this.createPendingCommand(WORKLET_COMMAND_TIMEOUT_MS);

        this._pendingClear = pendingClear;
        workletNode.port.postMessage({ type: 'clear', requestId: pendingClear.requestId });
        await pendingClear.promise;

        if (wasPaused && this._audioContext && this._state() !== 'disposed' && this._state() !== 'error') {
            try {
                await this._audioContext.suspend();
                this._state.set('paused');
            } catch (error: unknown) {
                throw this.failPlayback(error);
            }
        }
    }

    /**
     * Suspends output processing without discarding queued PCM samples.
     *
     * @public
     */
    public async pause(): Promise<void> {
        if (
            !this._audioContext ||
            this._state() === 'idle' ||
            this._state() === 'starting' ||
            this._state() === 'paused' ||
            this._state() === 'error' ||
            this._state() === 'disposed'
        ) {
            return;
        }

        this._stateBeforePause = this._state();

        try {
            await this._audioContext.suspend();
            this._state.set('paused');
        } catch (error: unknown) {
            throw this.failPlayback(error);
        }
    }

    /**
     * Resumes output processing after a pause.
     *
     * @public
     */
    public async resume(): Promise<void> {
        if (this._state() !== 'paused' || !this._audioContext) {
            return;
        }

        try {
            await this._audioContext.resume();

            if (this._pendingDrain) {
                this._state.set('draining');
            } else if (this._queuedSampleCount > 0) {
                this._state.set(this._stateBeforePause === 'playing' ? 'playing' : 'buffering');
            } else {
                this._state.set('ready');
            }
        } catch (error: unknown) {
            throw this.failPlayback(error);
        }
    }

    /**
     * Releases the active playback graph and returns the reusable instance to idle.
     *
     * @public
     */
    public async stop(): Promise<void> {
        if (this._state() === 'idle' || this._state() === 'disposed') {
            return;
        }

        const startSettlementPromise = this._startSettlementPromise ?? Promise.resolve();

        this._generation += 1;
        this._state.set('stopping');
        const stopError = new RealtimeAudioError('invalid-state', 'PCM playback stopped before the command completed.');

        this.rejectPendingCommands(stopError);
        await Promise.all([this.releaseRuntimeResources(), startSettlementPromise]);
        this.resetSessionState();
    }

    /**
     * Mutes or unmutes output without changing retained volume or queued audio.
     *
     * @param muted - True to silence output.
     * @public
     */
    public setMuted(muted: boolean): void {
        this._isMuted.set(muted);
        this.applyGain();
    }

    /**
     * Changes output volume while retaining mute state.
     *
     * @param volume - Volume in the inclusive range from zero to one.
     * @public
     */
    public setVolume(volume: number): void {
        if (!Number.isFinite(volume)) {
            throw new RangeError('PCM playback volume must be finite.');
        }

        this._volume.set(Math.max(0, Math.min(1, volume)));
        this.applyGain();
    }

    /**
     * Indicates whether required Web Audio and AudioWorklet APIs are available.
     *
     * @public
     * @returns True when realtime PCM playback can be initialized.
     */
    public isSupported(): boolean {
        return this.resolveAudioContextConstructor() !== null && typeof globalThis.AudioWorkletNode === 'function';
    }

    /**
     * Permanently releases the player and rejects any pending drain or clear command.
     *
     * @public
     */
    public dispose(): void {
        if (this._state() === 'disposed') {
            return;
        }

        this._generation += 1;
        this.rejectPendingCommands(
            new RealtimeAudioError('invalid-state', 'PCM playback was disposed before the command completed.')
        );
        void this.releaseRuntimeResources();
        this._bufferedDurationMs.set(0);
        this._format.set(null);
        this._queuedSampleCount = 0;
        this._state.set('disposed');
    }

    private applyGain(): void {
        if (!this._gainNode || !this._audioContext) {
            return;
        }

        const effectiveVolume = this._isMuted() ? 0 : this._volume();

        this._gainNode.gain.setValueAtTime(effectiveVolume, this._audioContext.currentTime);
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

    private createPendingCommand(timeoutMs: number): IPendingPlayerCommand {
        const requestId = ++this._commandSequence;
        let rejectPromise: (reason?: unknown) => void = () => undefined;
        let resolvePromise: () => void = () => undefined;
        const promise = new Promise<void>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        const timeoutId = globalThis.setTimeout(() => {
            const timeoutError = new RealtimeAudioError(
                'worklet-timeout',
                'PCM playback worklet did not acknowledge the command before the timeout.'
            );

            if (this._pendingDrain?.requestId === requestId) {
                this._pendingDrain = null;
            }

            if (this._pendingClear?.requestId === requestId) {
                this._pendingClear = null;
            }

            rejectPromise(timeoutError);
            this.failPlayback(timeoutError);
        }, timeoutMs);

        return {
            promise,
            reject: rejectPromise,
            requestId,
            resolve: resolvePromise,
            timeoutId
        };
    }

    private createStartSettlement(): void {
        this._startSettlementPromise = new Promise<void>((resolve) => {
            this._resolveStartSettlement = resolve;
        });
    }

    private createPlaybackGraph(
        audioContext: AudioContext,
        options: INormalizedPcmAudioStreamPlayerStartOptions,
        generation: number
    ): void {
        const workletNode = new AudioWorkletNode(audioContext, PCM_AUDIO_WORKLET_DEFINITION.playbackProcessorName, {
            channelCount: options.format.channelCount,
            channelCountMode: 'explicit',
            channelInterpretation: 'speakers',
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [options.format.channelCount],
            processorOptions: {
                channelCount: options.format.channelCount,
                initialBufferSampleCount: options.initialBufferSampleCount,
                maxBufferSampleCount: options.maxBufferSampleCount
            }
        });
        const gainNode = audioContext.createGain();

        workletNode.port.onmessage = (event: MessageEvent<unknown>): void =>
            this.onWorkletMessage(generation, event.data);
        workletNode.port.onmessageerror = (): void => {
            this.onWorkletFailure(generation, new Error('PCM playback worklet message decoding failed.'));
        };
        this._processorErrorHandler = (): void => {
            this.onWorkletFailure(generation, new Error('PCM playback worklet processor failed.'));
        };
        workletNode.addEventListener('processorerror', this._processorErrorHandler);
        workletNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        this._workletNode = workletNode;
        this._gainNode = gainNode;
    }

    private ensureAppendAllowed(): Readonly<IPcmAudioFormat> {
        const state = this._state();

        if (state === 'draining') {
            throw new RealtimeAudioError('invalid-state', 'Cannot append PCM frames after playback flush has started.');
        }

        if (state !== 'ready' && state !== 'buffering' && state !== 'playing' && state !== 'paused') {
            throw new RealtimeAudioError('invalid-state', `Cannot append PCM frames while state is ${state}.`);
        }

        const format = this._format();

        if (!format) {
            throw new RealtimeAudioError('invalid-state', 'PCM playback format is unavailable.');
        }

        return format;
    }

    private ensureControlAllowed(): AudioWorkletNode {
        const state = this._state();

        if (
            state !== 'ready' &&
            state !== 'buffering' &&
            state !== 'playing' &&
            state !== 'paused' &&
            state !== 'draining'
        ) {
            throw new RealtimeAudioError('invalid-state', `Cannot control PCM playback while state is ${state}.`);
        }

        if (!this._workletNode) {
            throw new RealtimeAudioError('invalid-state', 'PCM playback graph is unavailable.');
        }

        return this._workletNode;
    }

    private ensureStartAllowed(): void {
        if (this._state() === 'disposed') {
            throw new RealtimeAudioError('invalid-state', 'PCM stream player has been disposed.');
        }

        if (this._state() !== 'idle' && this._state() !== 'error') {
            throw new RealtimeAudioError(
                'invalid-state',
                `Cannot start PCM stream playback while state is ${this._state()}.`
            );
        }
    }

    private ensureSupport(): void {
        if (!this.isSupported()) {
            throw new RealtimeAudioError(
                'unsupported',
                'Realtime PCM playback requires AudioContext and AudioWorkletNode.'
            );
        }
    }

    private failPlayback(error: unknown): RealtimeAudioError {
        const playbackError = this.toPlaybackError(error);

        this._generation += 1;
        this.rejectPendingCommands(playbackError);
        void this.releaseRuntimeResources();
        this._error.set(playbackError);
        this._state.set('error');

        return playbackError;
    }

    private isWorkletMessage(message: unknown): message is IPlayerWorkletMessage {
        return typeof message === 'object' && message !== null && 'type' in message && typeof message.type === 'string';
    }

    private async loadWorkletModule(audioContext: AudioContext): Promise<void> {
        try {
            await this._workletModuleLoader.load(audioContext);
        } catch (error: unknown) {
            throw new RealtimeAudioError('worklet-load-failed', 'Realtime PCM processors could not be loaded.', error);
        }
    }

    private normalizeStartOptions(
        options: IPcmAudioStreamPlayerStartOptions
    ): INormalizedPcmAudioStreamPlayerStartOptions {
        let format: Readonly<IPcmAudioFormat>;

        try {
            format = PcmAudioFormatPolicy.normalize(options.format);
        } catch (error: unknown) {
            throw new RealtimeAudioError('invalid-format', 'The requested PCM playback format is invalid.', error);
        }

        const initialBufferDurationMs = options.initialBufferDurationMs ?? DEFAULT_INITIAL_BUFFER_DURATION_MS;
        const maxBufferDurationMs = options.maxBufferDurationMs ?? DEFAULT_MAX_BUFFER_DURATION_MS;
        const volume = options.volume ?? 1;

        if (!Number.isFinite(initialBufferDurationMs) || initialBufferDurationMs < 0) {
            throw new RealtimeAudioError(
                'invalid-format',
                'PCM initialBufferDurationMs must be a non-negative number.'
            );
        }

        if (
            !Number.isFinite(maxBufferDurationMs) ||
            maxBufferDurationMs <= 0 ||
            maxBufferDurationMs > MAX_BUFFER_DURATION_MS ||
            maxBufferDurationMs < initialBufferDurationMs
        ) {
            throw new RealtimeAudioError(
                'invalid-format',
                `PCM maxBufferDurationMs must be positive, at most ${MAX_BUFFER_DURATION_MS}, and not below the initial buffer.`
            );
        }

        if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
            throw new RealtimeAudioError('invalid-format', 'PCM playback volume must be between zero and one.');
        }

        return {
            format,
            initialBufferDurationMs,
            initialBufferSampleCount: Math.ceil((format.sampleRateHz * initialBufferDurationMs) / 1_000),
            maxBufferDurationMs,
            maxBufferSampleCount: Math.ceil((format.sampleRateHz * maxBufferDurationMs) / 1_000),
            volume
        };
    }

    private onWorkletFailure(generation: number, error: unknown): void {
        if (generation !== this._generation || this._state() === 'disposed') {
            return;
        }

        this.failPlayback(error);
    }

    private onWorkletMessage(generation: number, message: unknown): void {
        if (generation !== this._generation || this._state() === 'disposed' || !this.isWorkletMessage(message)) {
            return;
        }

        switch (message.type) {
            case 'buffered':
            case 'progress':
                this.synchronizeBufferedSamples(message);
                break;
            case 'playback-started':
                if (this._state() !== 'paused' && !this._pendingDrain) {
                    this._state.set('playing');
                }
                break;
            case 'underrun':
                this._queuedSampleCount = 0;
                this.updateBufferedDuration();
                this._underrunCount.update((count) => count + 1);
                if (!this._pendingDrain && this._state() !== 'paused') {
                    this._state.set('buffering');
                }
                break;
            case 'drained':
                this.onDrainedMessage(message);
                break;
            case 'cleared':
                this.onClearedMessage(message);
                break;
            case 'overflow':
                this.failPlayback(
                    new RealtimeAudioError(
                        'queue-overflow',
                        'PCM playback worklet rejected a frame beyond its queue limit.'
                    )
                );
                break;
            case 'processor-error':
                this.failPlayback(
                    new RealtimeAudioError(
                        'playback-failed',
                        typeof message['message'] === 'string'
                            ? message['message']
                            : 'PCM playback worklet reported a failure.'
                    )
                );
                break;
        }
    }

    private onClearedMessage(message: IPlayerWorkletMessage): void {
        const requestId = this.readRequestId(message);

        this._queuedSampleCount = 0;
        this._lastSequence = -1;
        this.updateBufferedDuration();

        if (requestId !== null) {
            this.resolvePendingCommand('_pendingClear', requestId);
        }

        if (this._state() !== 'paused' && this._state() !== 'disposed' && this._state() !== 'error') {
            this._state.set('ready');
        }
    }

    private onDrainedMessage(message: IPlayerWorkletMessage): void {
        const requestId = this.readRequestId(message);

        this._queuedSampleCount = 0;
        this._lastSequence = -1;
        this.updateBufferedDuration();

        if (requestId !== null) {
            this.resolvePendingCommand('_pendingDrain', requestId);
        }

        if (this._state() !== 'paused' && this._state() !== 'disposed' && this._state() !== 'error') {
            this._state.set('ready');
        }
    }

    private readRequestId(message: IPlayerWorkletMessage): number | null {
        const requestId = message['requestId'];

        return typeof requestId === 'number' && Number.isSafeInteger(requestId) ? requestId : null;
    }

    private rejectPendingCommands(reason: unknown): void {
        for (const pendingCommand of [this._pendingClear, this._pendingDrain]) {
            if (!pendingCommand) {
                continue;
            }

            globalThis.clearTimeout(pendingCommand.timeoutId);
            pendingCommand.reject(reason);
        }

        this._pendingClear = null;
        this._pendingDrain = null;
    }

    private async releaseRuntimeResources(): Promise<void> {
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
            this._workletNode?.disconnect();
        } catch {
            /** Browser nodes can already be disconnected during page teardown. */
        }

        try {
            this._gainNode?.disconnect();
        } catch {
            /** Browser nodes can already be disconnected during page teardown. */
        }

        this._workletNode = null;
        this._gainNode = null;

        const audioContext = this._audioContext;

        this._audioContext = null;
        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close().catch(() => undefined);
        }
    }

    private resetSessionState(): void {
        this._bufferedDurationMs.set(0);
        this._format.set(null);
        this._lastSequence = -1;
        this._maxBufferDurationMs = DEFAULT_MAX_BUFFER_DURATION_MS;
        this._maxBufferSampleCount = 0;
        this._queuedSampleCount = 0;
        this._stateBeforePause = 'ready';

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

    private resolvePendingCommand(field: '_pendingClear' | '_pendingDrain', requestId: number): void {
        const pendingCommand = this[field];

        if (!pendingCommand || pendingCommand.requestId !== requestId) {
            return;
        }

        globalThis.clearTimeout(pendingCommand.timeoutId);
        this[field] = null;
        pendingCommand.resolve();
    }

    private synchronizeBufferedSamples(message: IPlayerWorkletMessage): void {
        const bufferedSampleCount = message['bufferedSampleCount'];

        if (typeof bufferedSampleCount !== 'number' || !Number.isSafeInteger(bufferedSampleCount)) {
            return;
        }

        this._queuedSampleCount = Math.max(0, bufferedSampleCount);
        this.updateBufferedDuration();
    }

    private toPlaybackError(error: unknown): RealtimeAudioError {
        if (error instanceof RealtimeAudioError) {
            return error;
        }

        const message = error instanceof Error && error.message ? error.message : 'Realtime PCM playback failed.';

        return new RealtimeAudioError('playback-failed', message, error);
    }

    private updateBufferedDuration(): void {
        const format = this._format();

        this._bufferedDurationMs.set(format ? (this._queuedSampleCount / format.sampleRateHz) * 1_000 : 0);
    }

    private validateFrame(frame: IPcmAudioFrame, format: IPcmAudioFormat): number {
        if (!PcmAudioFormatPolicy.equals(frame.format, format)) {
            throw new RealtimeAudioError(
                'invalid-format',
                'PCM frame format does not match the active playback graph.'
            );
        }

        if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0 || frame.sequence <= this._lastSequence) {
            throw new RealtimeAudioError(
                'out-of-order-frame',
                `PCM frame sequence ${frame.sequence} does not follow ${this._lastSequence}.`
            );
        }

        if (!Number.isFinite(frame.timestampMs) || frame.timestampMs < 0) {
            throw new RealtimeAudioError(
                'invalid-format',
                'PCM frame timestampMs must be a non-negative finite number.'
            );
        }

        let sampleCount: number;

        try {
            sampleCount = PcmAudioFormatPolicy.calculateSampleCount(frame.data.byteLength, format);
        } catch (error: unknown) {
            throw new RealtimeAudioError('invalid-format', 'PCM frame payload is not aligned to its format.', error);
        }

        const expectedDurationMs = (sampleCount / format.sampleRateHz) * 1_000;
        const durationToleranceMs = Math.max(1, 1_000 / format.sampleRateHz);

        if (
            !Number.isFinite(frame.durationMs) ||
            frame.durationMs <= 0 ||
            Math.abs(frame.durationMs - expectedDurationMs) > durationToleranceMs
        ) {
            throw new RealtimeAudioError('invalid-format', 'PCM frame duration does not match its payload.');
        }

        return sampleCount;
    }

    // #endregion
}
