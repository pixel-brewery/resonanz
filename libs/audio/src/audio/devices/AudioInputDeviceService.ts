// #region Imports

import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { AudioInputDeviceError } from './errors/AudioInputDeviceError';
import type { AudioInputDeviceErrorCode } from './errors/AudioInputDeviceErrorCode';
import type { AudioInputPermissionState } from './models/AudioInputPermissionState';
import type { AudioInputSignalQuality } from './models/AudioInputSignalQuality';
import type { AudioInputTestState } from './models/AudioInputTestState';
import type { IAudioInputDevice } from './models/IAudioInputDevice';

// #endregion

interface IAudioInputWindow extends Window {
    readonly AudioContext?: typeof AudioContext;
    readonly webkitAudioContext?: typeof AudioContext;
}

const ANALYSIS_INTERVAL_MS = 100;
const REQUIRED_SUCCESSFUL_SAMPLES = 3;

/**
 * Discovers browser microphones and owns one short-lived, non-recording voice-test stream.
 *
 * @public
 */
@Injectable({
    providedIn: 'root'
})
export class AudioInputDeviceService {
    // #region Fields

    private readonly _destroyRef: DestroyRef = inject(DestroyRef);
    private readonly _activeDeviceId = signal<string | null>(null);
    private readonly _decibels = signal<number | null>(null);
    private readonly _devices = signal<ReadonlyArray<IAudioInputDevice>>([]);
    private readonly _error = signal<AudioInputDeviceError | null>(null);
    private readonly _isBusy = signal<boolean>(false);
    private readonly _isSupported = signal<boolean>(this.hasBrowserSupport());
    private readonly _mediaStream = signal<MediaStream | null>(null);
    private readonly _permissionState = signal<AudioInputPermissionState>(
        this.hasBrowserSupport() ? 'unknown' : 'unsupported'
    );
    private readonly _signalQuality = signal<AudioInputSignalQuality>('unknown');
    private readonly _testState = signal<AudioInputTestState>(this.hasBrowserSupport() ? 'idle' : 'unsupported');
    private readonly _testedDeviceId = signal<string | null>(null);
    private readonly _isTesting = computed<boolean>(() => {
        const state = this._testState();

        return this._mediaStream() !== null || state === 'starting';
    });
    private _activeOperations = 0;
    private _analysisBuffer: Float32Array<ArrayBuffer> | null = null;
    private _analysisTimerId: ReturnType<typeof globalThis.setInterval> | null = null;
    private _analyser: AnalyserNode | null = null;
    private _audioContext: AudioContext | null = null;
    private _deviceChangeHandler: (() => void) | null = null;
    private _generation = 0;
    private _initialized = false;
    private _mediaStreamSource: MediaStreamAudioSourceNode | null = null;
    private _permissionChangeHandler: (() => void) | null = null;
    private _permissionStatus: PermissionStatus | null = null;
    private _successfulSamples = 0;

    // #endregion

    // #region Ctor

    /**
     * Creates the service and guarantees release of browser audio resources.
     *
     * @public
     */
    public constructor() {
        this._destroyRef.onDestroy(() => this.dispose());
    }

    // #endregion

    // #region Properties

    /** Active microphone identifier while a voice test owns a stream. */
    public get activeDeviceId(): Signal<string | null> {
        return this._activeDeviceId.asReadonly();
    }

    /** Current signal level in dBFS. */
    public get decibels(): Signal<number | null> {
        return this._decibels.asReadonly();
    }

    /** Available browser audio-input devices. */
    public get devices(): Signal<ReadonlyArray<IAudioInputDevice>> {
        return this._devices.asReadonly();
    }

    /** Last typed discovery, permission, capture, or analysis failure. */
    public get error(): Signal<AudioInputDeviceError | null> {
        return this._error.asReadonly();
    }

    /** Indicates whether a browser operation is currently pending. */
    public get isBusy(): Signal<boolean> {
        return this._isBusy.asReadonly();
    }

    /** Indicates whether the required browser media APIs are available. */
    public get isSupported(): Signal<boolean> {
        return this._isSupported.asReadonly();
    }

    /** Indicates whether a voice-test stream is starting or active. */
    public get isTesting(): Signal<boolean> {
        return this._isTesting;
    }

    /** Externally consumable stream for live waveform visualization. */
    public get mediaStream(): Signal<MediaStream | null> {
        return this._mediaStream.asReadonly();
    }

    /** Current browser microphone permission state. */
    public get permissionState(): Signal<AudioInputPermissionState> {
        return this._permissionState.asReadonly();
    }

    /** Current normalized microphone signal quality. */
    public get signalQuality(): Signal<AudioInputSignalQuality> {
        return this._signalQuality.asReadonly();
    }

    /** Current voice-test lifecycle. */
    public get testState(): Signal<AudioInputTestState> {
        return this._testState.asReadonly();
    }

    /** Device identifier that passed during the current card lifetime. */
    public get testedDeviceId(): Signal<string | null> {
        return this._testedDeviceId.asReadonly();
    }

    // #endregion

    // #region Methods

    /**
     * Discovers devices, observes browser changes, and resolves the current permission state.
     *
     * @public
     */
    public async initialize(): Promise<void> {
        this.ensureSupport();

        if (!this._initialized) {
            this.attachDeviceChangeListener();
            this._initialized = true;
        }

        await Promise.all([this.queryPermissionState(), this.refresh()]);
    }

    /**
     * Refreshes the browser's current audio-input inventory.
     *
     * @public
     */
    public async refresh(): Promise<void> {
        const mediaDevices = this.resolveMediaDevices();

        if (!mediaDevices) {
            this.markUnsupported();
            throw new AudioInputDeviceError('unsupported', 'Browser audio-input APIs are unavailable.');
        }

        this.beginOperation();

        try {
            const devices = await mediaDevices.enumerateDevices();

            const audioInputDevices = devices
                .filter((device) => device.kind === 'audioinput')
                .map((device) => ({
                    deviceId: device.deviceId,
                    groupId: device.groupId,
                    label: device.label
                }));

            this._devices.set(audioInputDevices);
            if (
                (this._permissionState() === 'prompt' || this._permissionState() === 'unknown') &&
                audioInputDevices.some((device) => device.label.trim().length > 0)
            ) {
                this._permissionState.set('granted');
            }
            this._error.set(null);
        } catch (error: unknown) {
            const deviceError = new AudioInputDeviceError(
                'device-enumeration-failed',
                'Audio-input devices could not be enumerated.',
                error
            );

            this._error.set(deviceError);
            throw deviceError;
        } finally {
            this.endOperation();
        }
    }

    /**
     * Requests microphone permission without retaining or recording the acquired stream.
     *
     * @public
     */
    public async requestPermission(): Promise<void> {
        const mediaDevices = this.resolveMediaDevices();

        if (!mediaDevices) {
            this.markUnsupported();
            throw new AudioInputDeviceError('unsupported', 'Browser audio-input APIs are unavailable.');
        }

        this.beginOperation();

        try {
            const stream = await mediaDevices.getUserMedia({ audio: true });

            this.stopTracks(stream);
            this._permissionState.set('granted');
            this._error.set(null);
            await this.refresh();
        } catch (error: unknown) {
            const deviceError = this.mapCaptureError(error);

            this.applyPermissionFailure(deviceError);
            this._error.set(deviceError);
            throw deviceError;
        } finally {
            this.endOperation();
        }
    }

    /**
     * Starts a non-recording voice test for one browser microphone.
     *
     * @param deviceId - Exact browser-scoped device identifier.
     * @public
     */
    public async startTest(deviceId: string): Promise<void> {
        const normalizedDeviceId = deviceId.trim();
        const mediaDevices = this.resolveMediaDevices();

        if (!mediaDevices) {
            this.markUnsupported();
            throw new AudioInputDeviceError('unsupported', 'Browser audio-input APIs are unavailable.');
        }

        if (!normalizedDeviceId) {
            const deviceError = new AudioInputDeviceError('device-not-found', 'No audio-input device was selected.');

            this._error.set(deviceError);
            this._testState.set('error');
            throw deviceError;
        }

        const generation = ++this._generation;

        this.releaseTestResources(true);
        this._activeDeviceId.set(normalizedDeviceId);
        this._error.set(null);
        this._testedDeviceId.set(null);
        this._testState.set('starting');
        this.beginOperation();

        let stream: MediaStream | null = null;

        try {
            stream = await mediaDevices.getUserMedia({
                audio: {
                    autoGainControl: true,
                    deviceId: { exact: normalizedDeviceId },
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            if (generation !== this._generation) {
                this.stopTracks(stream);
                return;
            }

            this._mediaStream.set(stream);
            this._permissionState.set('granted');
            await this.startAnalysis(stream);
            this._testState.set('listening');
            this._error.set(null);
            void this.refresh().catch(() => undefined);
        } catch (error: unknown) {
            if (generation !== this._generation) {
                if (stream) {
                    this.stopTracks(stream);
                }
                return;
            }

            const deviceError = error instanceof AudioInputDeviceError ? error : this.mapCaptureError(error);

            this.releaseTestResources(true);
            this.applyPermissionFailure(deviceError);
            this._error.set(deviceError);
            this._testState.set(deviceError.code === 'unsupported' ? 'unsupported' : 'error');
            throw deviceError;
        } finally {
            this.endOperation();
        }
    }

    /**
     * Stops the owned test stream while preserving a successful test result.
     *
     * @public
     */
    public stopTest(): void {
        ++this._generation;

        const didPass = this._testedDeviceId() !== null;

        this.releaseTestResources(!didPass);
        this._testState.set(didPass ? 'passed' : this._isSupported() ? 'idle' : 'unsupported');
    }

    /**
     * Releases listeners, streams, timers, and Web Audio nodes.
     *
     * @public
     */
    public dispose(): void {
        ++this._generation;
        this.detachDeviceChangeListener();
        this.detachPermissionListener();
        this.releaseTestResources(true);
        this._initialized = false;
    }

    private applyPermissionFailure(error: AudioInputDeviceError): void {
        if (error.code === 'permission-denied') {
            this._permissionState.set('denied');
        }
    }

    private attachDeviceChangeListener(): void {
        const mediaDevices = this.resolveMediaDevices();

        if (!mediaDevices || this._deviceChangeHandler) {
            return;
        }

        this._deviceChangeHandler = () => {
            void this.refresh().catch(() => undefined);
        };
        mediaDevices.addEventListener('devicechange', this._deviceChangeHandler);
    }

    private attachPermissionListener(permissionStatus: PermissionStatus): void {
        this.detachPermissionListener();

        this._permissionStatus = permissionStatus;
        this._permissionChangeHandler = () => {
            this._permissionState.set(permissionStatus.state);
        };
        permissionStatus.addEventListener('change', this._permissionChangeHandler);
    }

    private beginOperation(): void {
        this._activeOperations += 1;
        this._isBusy.set(true);
    }

    private classifySignal(rms: number, peak: number): AudioInputSignalQuality {
        if (peak >= 0.985) {
            return 'clipping';
        }

        if (rms < 0.008) {
            return 'no-signal';
        }

        if (rms < 0.025) {
            return 'poor';
        }

        if (rms < 0.065) {
            return 'fair';
        }

        return 'good';
    }

    private detachDeviceChangeListener(): void {
        const mediaDevices = this.resolveMediaDevices();

        if (mediaDevices && this._deviceChangeHandler) {
            mediaDevices.removeEventListener('devicechange', this._deviceChangeHandler);
        }

        this._deviceChangeHandler = null;
    }

    private detachPermissionListener(): void {
        if (this._permissionStatus && this._permissionChangeHandler) {
            this._permissionStatus.removeEventListener('change', this._permissionChangeHandler);
        }

        this._permissionChangeHandler = null;
        this._permissionStatus = null;
    }

    private endOperation(): void {
        this._activeOperations = Math.max(0, this._activeOperations - 1);
        this._isBusy.set(this._activeOperations > 0);
    }

    private ensureSupport(): void {
        if (!this.hasBrowserSupport()) {
            this.markUnsupported();
            throw new AudioInputDeviceError('unsupported', 'Browser audio-input APIs are unavailable.');
        }
    }

    private failAnalysis(error: unknown): void {
        const deviceError =
            error instanceof AudioInputDeviceError
                ? error
                : new AudioInputDeviceError('analysis-failed', 'The microphone signal could not be analysed.', error);

        ++this._generation;
        this.releaseTestResources(true);
        this._error.set(deviceError);
        this._testState.set('error');
    }

    private hasBrowserSupport(): boolean {
        return this.resolveMediaDevices() !== null;
    }

    private mapCaptureError(error: unknown): AudioInputDeviceError {
        if (error instanceof AudioInputDeviceError) {
            return error;
        }

        const name = this.readErrorName(error);
        const code = this.mapCaptureErrorCode(name);
        const message = error instanceof Error && error.message ? error.message : 'Microphone acquisition failed.';

        return new AudioInputDeviceError(code, message, error);
    }

    private mapCaptureErrorCode(name: string): AudioInputDeviceErrorCode {
        switch (name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'permission-denied';
            case 'NotFoundError':
            case 'DevicesNotFoundError':
            case 'OverconstrainedError':
            case 'ConstraintNotSatisfiedError':
                return 'device-not-found';
            case 'NotReadableError':
            case 'TrackStartError':
                return 'device-busy';
            default:
                return 'capture-failed';
        }
    }

    private markUnsupported(): void {
        this._isSupported.set(false);
        this._permissionState.set('unsupported');
        this._testState.set('unsupported');
    }

    private queryPermissionState(): Promise<void> {
        if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
            if (this._permissionState() === 'unknown') {
                this._permissionState.set('prompt');
            }

            return Promise.resolve();
        }

        return navigator.permissions
            .query({ name: 'microphone' as PermissionName })
            .then((permissionStatus) => {
                this._permissionState.set(permissionStatus.state);
                this.attachPermissionListener(permissionStatus);
            })
            .catch(() => {
                if (this._permissionState() === 'unknown') {
                    this._permissionState.set('prompt');
                }
            });
    }

    private readErrorName(error: unknown): string {
        if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
            return error.name;
        }

        return '';
    }

    private releaseTestResources(resetSignal: boolean): void {
        if (this._analysisTimerId !== null) {
            globalThis.clearInterval(this._analysisTimerId);
            this._analysisTimerId = null;
        }

        try {
            this._mediaStreamSource?.disconnect();
        } catch {
            // Browser nodes can already be disconnected during page teardown.
        }

        this._mediaStreamSource = null;
        this._analyser = null;
        this._analysisBuffer = null;

        const audioContext = this._audioContext;

        this._audioContext = null;
        if (audioContext && audioContext.state !== 'closed') {
            void audioContext.close().catch(() => undefined);
        }

        const stream = this._mediaStream();

        if (stream) {
            this.stopTracks(stream);
        }

        this._mediaStream.set(null);
        this._activeDeviceId.set(null);
        this._successfulSamples = 0;

        if (resetSignal) {
            this._decibels.set(null);
            this._signalQuality.set('unknown');
        }
    }

    private resolveAudioContextConstructor(): typeof AudioContext | null {
        if (typeof window === 'undefined') {
            return null;
        }

        const browserWindow = window as IAudioInputWindow;

        return browserWindow.AudioContext ?? browserWindow.webkitAudioContext ?? null;
    }

    private resolveMediaDevices(): MediaDevices | null {
        if (typeof navigator === 'undefined') {
            return null;
        }

        const mediaDevices = navigator.mediaDevices;

        if (
            !mediaDevices ||
            typeof mediaDevices.getUserMedia !== 'function' ||
            typeof mediaDevices.enumerateDevices !== 'function'
        ) {
            return null;
        }

        return mediaDevices;
    }

    private sampleSignal(): void {
        const analyser = this._analyser;
        const analysisBuffer = this._analysisBuffer;

        if (!analyser || !analysisBuffer) {
            return;
        }

        analyser.getFloatTimeDomainData(analysisBuffer);

        let peak = 0;
        let sumOfSquares = 0;

        for (const sample of analysisBuffer) {
            const absoluteSample = Math.abs(sample);

            peak = Math.max(peak, absoluteSample);
            sumOfSquares += sample * sample;
        }

        const rms = Math.sqrt(sumOfSquares / analysisBuffer.length);
        const decibels = rms > 0 ? 20 * Math.log10(rms) : null;
        const quality = this.classifySignal(rms, peak);

        this._decibels.set(decibels === null ? null : Math.round(decibels));
        this._signalQuality.set(quality);

        if (quality === 'fair' || quality === 'good') {
            this._successfulSamples += 1;
        } else {
            this._successfulSamples = 0;
        }

        if (this._successfulSamples >= REQUIRED_SUCCESSFUL_SAMPLES) {
            this._testedDeviceId.set(this._activeDeviceId());
            this._testState.set('passed');
        }
    }

    private sampleSignalSafely(): void {
        try {
            this.sampleSignal();
        } catch (error: unknown) {
            this.failAnalysis(error);
        }
    }

    private async startAnalysis(stream: MediaStream): Promise<void> {
        const AudioContextConstructor = this.resolveAudioContextConstructor();

        if (!AudioContextConstructor) {
            throw new AudioInputDeviceError('analysis-failed', 'The Web Audio API is unavailable.');
        }

        try {
            const audioContext = new AudioContextConstructor();

            this._audioContext = audioContext;

            const analyser = audioContext.createAnalyser();

            this._analyser = analyser;

            const source = audioContext.createMediaStreamSource(stream);

            this._mediaStreamSource = source;

            analyser.fftSize = 2_048;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);

            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            this._analysisBuffer = new Float32Array(analyser.fftSize);
            this._analysisTimerId = globalThis.setInterval(() => this.sampleSignalSafely(), ANALYSIS_INTERVAL_MS);
            this.sampleSignal();
        } catch (error: unknown) {
            throw new AudioInputDeviceError('analysis-failed', 'The microphone signal could not be analysed.', error);
        }
    }

    private stopTracks(stream: MediaStream): void {
        for (const track of stream.getTracks()) {
            track.stop();
        }
    }

    // #endregion
}
