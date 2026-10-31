// #region Imports

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioRecorder } from './AudioRecorder';
import { AudioRecorderError } from './errors/AudioRecorderError';
import type { IAudioRecorderChunk } from './models/IAudioRecorderChunk';
import type { IAudioRecordingResult } from './models/IAudioRecordingResult';
import { VOICE_TRANSCRIBER } from './transcribers/interfaces/IVoiceTranscriber';

// #endregion

interface IDeferred<T> {
    readonly promise: Promise<T>;
    readonly reject: (reason?: unknown) => void;
    readonly resolve: (value: T) => void;
}

interface IMockMediaRecorderController {
    constructedOptions: MediaRecorderOptions | null;
    constructedStream: MediaStream | null;
    readonly instance: MediaRecorder;
    readonly pause: ReturnType<typeof vi.fn>;
    readonly requestData: ReturnType<typeof vi.fn>;
    readonly resume: ReturnType<typeof vi.fn>;
    readonly start: ReturnType<typeof vi.fn>;
    readonly stop: ReturnType<typeof vi.fn>;
    emitChunk(blob: Blob, timecodeMs?: number): void;
    emitError(error: DOMException): void;
    emitStop(): void;
}

interface IMockMediaStream {
    readonly stream: MediaStream;
    readonly stopTrack: ReturnType<typeof vi.fn>;
    readonly track: MediaStreamTrack;
}

function createDeferred<T>(): IDeferred<T> {
    let rejectPromise: (reason?: unknown) => void = () => undefined;
    let resolvePromise: (value: T) => void = () => undefined;
    const promise = new Promise<T>((resolve, reject) => {
        rejectPromise = reject;
        resolvePromise = resolve;
    });

    return {
        promise,
        reject: rejectPromise,
        resolve: resolvePromise
    };
}

function createMockMediaStream(): IMockMediaStream {
    const stopTrack = vi.fn();
    const track = {
        enabled: true,
        kind: 'audio',
        readyState: 'live',
        stop: stopTrack
    } as unknown as MediaStreamTrack;
    const stream = {
        getAudioTracks: vi.fn(() => [track]),
        getTracks: vi.fn(() => [track])
    } as unknown as MediaStream;

    return {
        stream,
        stopTrack,
        track
    };
}

function createMockMediaRecorder(): IMockMediaRecorderController {
    let onDataAvailable: ((event: BlobEvent) => void) | null = null;
    let onError: ((event: Event) => void) | null = null;
    let onStop: (() => void) | null = null;
    let state: RecordingState = 'inactive';

    const start = vi.fn((timeslice?: number) => {
        void timeslice;
        state = 'recording';
    });
    const stop = vi.fn(() => {
        state = 'inactive';
    });
    const pause = vi.fn(() => {
        state = 'paused';
    });
    const resume = vi.fn(() => {
        state = 'recording';
    });
    const requestData = vi.fn();
    const instance = {
        get state(): RecordingState {
            return state;
        },
        mimeType: 'audio/webm;codecs=opus',
        pause,
        requestData,
        resume,
        start,
        stop,
        get ondataavailable(): ((event: BlobEvent) => void) | null {
            return onDataAvailable;
        },
        set ondataavailable(handler: ((event: BlobEvent) => void) | null) {
            onDataAvailable = handler;
        },
        get onerror(): ((event: Event) => void) | null {
            return onError;
        },
        set onerror(handler: ((event: Event) => void) | null) {
            onError = handler;
        },
        get onstop(): (() => void) | null {
            return onStop;
        },
        set onstop(handler: (() => void) | null) {
            onStop = handler;
        }
    } as unknown as MediaRecorder;
    const controller: IMockMediaRecorderController = {
        constructedOptions: null,
        constructedStream: null,
        instance,
        pause,
        requestData,
        resume,
        start,
        stop,
        emitChunk(blob: Blob, timecodeMs = 0): void {
            onDataAvailable?.({
                data: blob,
                timecode: timecodeMs
            } as BlobEvent);
        },
        emitError(error: DOMException): void {
            onError?.({ error } as Event & { readonly error: DOMException });
        },
        emitStop(): void {
            state = 'inactive';
            onStop?.();
        }
    };

    return controller;
}

function installMediaRecorder(controller: IMockMediaRecorderController): void {
    class FakeMediaRecorder {
        public static readonly isTypeSupported = vi.fn((mimeType: string) => mimeType.startsWith('audio/webm'));

        public constructor(stream: MediaStream, options?: MediaRecorderOptions) {
            controller.constructedStream = stream;
            controller.constructedOptions = options ?? null;

            return controller.instance as unknown as FakeMediaRecorder;
        }
    }

    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
}

function installNavigator(getUserMedia: ReturnType<typeof vi.fn>): void {
    vi.stubGlobal('navigator', {
        mediaDevices: {
            getUserMedia
        }
    });
}

describe('AudioRecorder', () => {
    let controller: IMockMediaRecorderController;
    let getUserMedia: ReturnType<typeof vi.fn>;
    let mediaStream: IMockMediaStream;
    let recorder: AudioRecorder;

    beforeEach(() => {
        mediaStream = createMockMediaStream();
        controller = createMockMediaRecorder();
        getUserMedia = vi.fn().mockResolvedValue(mediaStream.stream);

        installNavigator(getUserMedia);
        installMediaRecorder(controller);
        Object.defineProperty(globalThis.URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:recording')
        });
        Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn()
        });
        vi.useFakeTimers();

        TestBed.configureTestingModule({
            providers: [provideZonelessChangeDetection(), { provide: VOICE_TRANSCRIBER, useValue: null }, AudioRecorder]
        });
        recorder = TestBed.inject(AudioRecorder);
    });

    afterEach(() => {
        TestBed.resetTestingModule();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('initial state', () => {
        it('starts idle without retained or live resources', () => {
            // arrange

            // act
            const snapshot = {
                active: recorder.isActive(),
                blob: recorder.audioBlob(),
                chunk: recorder.latestChunk(),
                duration: recorder.durationMs(),
                error: recorder.error(),
                stream: recorder.mediaStream(),
                state: recorder.state()
            };

            // assert
            expect(snapshot).toEqual({
                active: false,
                blob: null,
                chunk: null,
                duration: 0,
                error: null,
                stream: null,
                state: 'idle'
            });
            expect(recorder.durationLabel()).toBe('00:00');
        });

        it('reports browser support only when both required APIs exist', () => {
            // arrange
            delete (globalThis as unknown as Record<string, unknown>)['MediaRecorder'];

            // act
            const supported = recorder.isSupported();

            // assert
            expect(supported).toBe(false);
        });
    });

    describe('start', () => {
        it('acquires the requested microphone and starts periodic chunking', async () => {
            // arrange
            const options = {
                audioBitsPerSecond: 96_000,
                audioConstraints: {
                    autoGainControl: false,
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48_000
                },
                audioDeviceId: 'microphone-2',
                chunkIntervalMs: 2_500,
                preferredMimeTypes: ['audio/webm;codecs=opus']
            } as const;

            // act
            await recorder.start(options);

            // assert
            expect(getUserMedia).toHaveBeenCalledWith({
                audio: {
                    autoGainControl: false,
                    deviceId: { exact: 'microphone-2' },
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48_000
                }
            });
            expect(controller.constructedStream).toBe(mediaStream.stream);
            expect(controller.constructedOptions).toEqual({
                audioBitsPerSecond: 96_000,
                mimeType: 'audio/webm;codecs=opus'
            });
            expect(controller.start).toHaveBeenCalledWith(2_500);
        });

        it('exposes the live stream and effective encoder state after acquisition', async () => {
            // arrange

            // act
            await recorder.start();

            // assert
            expect(recorder.mediaStream()).toBe(mediaStream.stream);
            expect(recorder.mimeType()).toBe('audio/webm;codecs=opus');
            expect(recorder.state()).toBe('recording');
            expect(recorder.isActive()).toBe(true);
            expect(recorder.isRecording()).toBe(true);
        });

        it('publishes the acquiring state while microphone permission is pending', async () => {
            // arrange
            const deferredStream = createDeferred<MediaStream>();
            getUserMedia.mockReturnValueOnce(deferredStream.promise);

            // act
            const startPromise = recorder.start();

            // assert
            expect(recorder.state()).toBe('acquiring');

            deferredStream.resolve(mediaStream.stream);
            await startPromise;
        });

        it('rejects a second start without replacing the active stream', async () => {
            // arrange
            await recorder.start();

            // act
            const secondStart = recorder.start();

            // assert
            await expect(secondStart).rejects.toMatchObject({
                code: 'invalid-state'
            });
            expect(getUserMedia).toHaveBeenCalledTimes(1);
            expect(mediaStream.stopTrack).not.toHaveBeenCalled();
            expect(recorder.state()).toBe('recording');
        });

        it('maps denied microphone access to a stable recoverable error', async () => {
            // arrange
            getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));

            // act
            const startPromise = recorder.start();

            // assert
            await expect(startPromise).rejects.toMatchObject({
                code: 'permission-denied'
            });
            expect(recorder.error()?.code).toBe('permission-denied');
            expect(recorder.state()).toBe('error');
        });

        it('releases an acquired stream when encoder construction fails', async () => {
            // arrange
            class FailingMediaRecorder {
                public static readonly isTypeSupported = vi.fn(() => true);

                public constructor() {
                    throw new Error('Encoder unavailable');
                }
            }
            vi.stubGlobal('MediaRecorder', FailingMediaRecorder);

            // act
            const startPromise = recorder.start();

            // assert
            await expect(startPromise).rejects.toMatchObject({
                code: 'recorder-failed'
            });
            expect(mediaStream.stopTrack).toHaveBeenCalledOnce();
            expect(recorder.mediaStream()).toBeNull();
            expect(recorder.state()).toBe('error');
        });

        it('rejects invalid chunk intervals before requesting microphone access', async () => {
            // arrange

            // act
            const startPromise = recorder.start({ chunkIntervalMs: 0 });

            // assert
            await expect(startPromise).rejects.toThrow('chunkIntervalMs');
            expect(getUserMedia).not.toHaveBeenCalled();
            expect(recorder.state()).toBe('idle');
        });

        it('releases a late stream after acquisition was cancelled', async () => {
            // arrange
            const deferredStream = createDeferred<MediaStream>();
            getUserMedia.mockReturnValueOnce(deferredStream.promise);
            const startPromise = recorder.start();

            // act
            await recorder.stop();
            deferredStream.resolve(mediaStream.stream);
            await startPromise;

            // assert
            expect(mediaStream.stopTrack).toHaveBeenCalledOnce();
            expect(controller.start).not.toHaveBeenCalled();
            expect(recorder.state()).toBe('idle');
        });
    });

    describe('incremental chunks', () => {
        it('emits ordered chunks before the recording stops', async () => {
            // arrange
            const chunks: IAudioRecorderChunk[] = [];
            recorder.chunkAvailable.subscribe((chunk) => chunks.push(chunk));
            await recorder.start();
            vi.advanceTimersByTime(1_250);
            const firstBlob = new Blob(['first'], { type: 'audio/webm' });
            const secondBlob = new Blob(['second'], { type: 'audio/webm' });

            // act
            controller.emitChunk(firstBlob, 1_000);
            controller.emitChunk(secondBlob, 2_000);

            // assert
            expect(chunks).toHaveLength(2);
            expect(chunks.map((chunk) => chunk.sequence)).toEqual([0, 1]);
            expect(chunks[0]).toMatchObject({
                blob: firstBlob,
                mimeType: 'audio/webm',
                timecodeMs: 1_000
            });
            expect(chunks[0].elapsedMs).toBeGreaterThan(0);
            expect(recorder.latestChunk()).toBe(chunks[1]);
            expect(recorder.state()).toBe('recording');
        });

        it('ignores empty browser chunks without creating sequence gaps', async () => {
            // arrange
            const chunks: IAudioRecorderChunk[] = [];
            recorder.chunkAvailable.subscribe((chunk) => chunks.push(chunk));
            await recorder.start();

            // act
            controller.emitChunk(new Blob([], { type: 'audio/webm' }));
            controller.emitChunk(new Blob(['content'], { type: 'audio/webm' }));

            // assert
            expect(chunks).toHaveLength(1);
            expect(chunks[0].sequence).toBe(0);
        });

        it('can explicitly flush the active browser encoder', async () => {
            // arrange
            await recorder.start();

            // act
            recorder.requestData();

            // assert
            expect(controller.requestData).toHaveBeenCalledOnce();
        });

        it('streams chunks without assembling an hour-sized in-memory blob', async () => {
            // arrange
            const chunks: IAudioRecorderChunk[] = [];
            recorder.chunkAvailable.subscribe((chunk) => chunks.push(chunk));
            await recorder.start({ retention: 'none' });
            controller.emitChunk(new Blob(['bounded'], { type: 'audio/webm' }));

            // act
            const stopPromise = recorder.stop();
            controller.emitStop();
            const result = await stopPromise;

            // assert
            expect(chunks).toHaveLength(1);
            expect(result).toMatchObject({
                blob: null,
                chunkCount: 1,
                retention: 'none'
            });
            expect(recorder.audioBlob()).toBeNull();
            expect(URL.createObjectURL).not.toHaveBeenCalled();
        });
    });

    describe('pause and mute', () => {
        it('excludes paused time from the recording duration', async () => {
            // arrange
            await recorder.start();
            vi.advanceTimersByTime(1_000);
            recorder.pause();
            vi.advanceTimersByTime(5_000);

            // act
            recorder.resume();
            vi.advanceTimersByTime(1_000);

            // assert
            expect(controller.pause).toHaveBeenCalledOnce();
            expect(controller.resume).toHaveBeenCalledOnce();
            expect(recorder.durationMs()).toBe(2_000);
            expect(recorder.durationLabel()).toBe('00:02');
        });

        it('mutes the live microphone without pausing or ending it', async () => {
            // arrange
            await recorder.start();

            // act
            recorder.setMuted(true);

            // assert
            expect(mediaStream.track.enabled).toBe(false);
            expect(recorder.isMuted()).toBe(true);
            expect(recorder.state()).toBe('recording');
        });
    });

    describe('stop and cancel', () => {
        it('waits for the final browser event before releasing the stream', async () => {
            // arrange
            await recorder.start();

            // act
            const stopPromise = recorder.stop();

            // assert
            expect(recorder.state()).toBe('stopping');
            expect(mediaStream.stopTrack).not.toHaveBeenCalled();

            controller.emitStop();
            await stopPromise;
            expect(mediaStream.stopTrack).toHaveBeenCalledOnce();
            expect(recorder.state()).toBe('idle');
        });

        it('returns and publishes the final retained recording metadata', async () => {
            // arrange
            const completions: IAudioRecordingResult[] = [];
            recorder.recordingCompleted.subscribe((result) => completions.push(result));
            await recorder.start();
            controller.emitChunk(new Blob(['one'], { type: 'audio/webm' }));
            controller.emitChunk(new Blob(['two'], { type: 'audio/webm' }));

            // act
            const stopPromise = recorder.stop();
            controller.emitStop();
            const result = await stopPromise;

            // assert
            expect(result).toMatchObject({
                chunkCount: 2,
                mimeType: 'audio/webm;codecs=opus',
                retention: 'memory'
            });
            expect(result?.blob).toBeInstanceOf(Blob);
            expect(recorder.recordingResult()).toBe(result);
            expect(recorder.audioBlob()).toBe(result?.blob);
            expect(recorder.audioUrl()).toBe('blob:recording');
            expect(completions).toEqual([result]);
        });

        it('completes retained recording when object URL creation is unavailable', async () => {
            // arrange
            vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
                throw new Error('Object URLs unavailable');
            });
            await recorder.start();
            controller.emitChunk(new Blob(['one'], { type: 'audio/webm' }));

            // act
            const stopPromise = recorder.stop();
            controller.emitStop();
            const result = await stopPromise;

            // assert
            expect(result?.blob).toBeInstanceOf(Blob);
            expect(recorder.audioBlob()).toBe(result?.blob);
            expect(recorder.audioUrl()).toBeNull();
            expect(recorder.state()).toBe('idle');
        });

        it('shares one completion across repeated stop calls', async () => {
            // arrange
            await recorder.start();

            // act
            const firstStop = recorder.stop();
            const secondStop = recorder.stop();
            controller.emitStop();

            // assert
            expect(secondStop).toBe(firstStop);
            await expect(firstStop).resolves.toMatchObject({ retention: 'memory' });
            expect(controller.stop).toHaveBeenCalledOnce();
        });

        it('treats stop outside an active session as an idempotent no-op', async () => {
            // arrange

            // act
            const result = await recorder.stop();

            // assert
            expect(result).toBeNull();
            expect(controller.stop).not.toHaveBeenCalled();
            expect(recorder.state()).toBe('idle');
        });

        it('discards chunks and retained output when the session is cancelled', async () => {
            // arrange
            await recorder.start();
            controller.emitChunk(new Blob(['private'], { type: 'audio/webm' }));

            // act
            const cancelPromise = recorder.cancel();
            controller.emitStop();
            await cancelPromise;

            // assert
            expect(recorder.audioBlob()).toBeNull();
            expect(recorder.audioUrl()).toBeNull();
            expect(recorder.latestChunk()).toBeNull();
            expect(recorder.recordingResult()).toBeNull();
            expect(recorder.state()).toBe('idle');
        });
    });

    describe('error recovery', () => {
        it('rejects a pending stop and releases resources after encoder failure', async () => {
            // arrange
            await recorder.start();
            const stopPromise = recorder.stop();
            const browserError = new DOMException('Device disconnected', 'UnknownError');

            // act
            controller.emitError(browserError);

            // assert
            await expect(stopPromise).rejects.toMatchObject({
                code: 'recorder-failed'
            });
            expect(recorder.error()).toBeInstanceOf(AudioRecorderError);
            expect(recorder.state()).toBe('error');
            expect(recorder.mediaStream()).toBeNull();
            expect(mediaStream.stopTrack).toHaveBeenCalledOnce();
        });

        it('can start a fresh session after an acquisition failure', async () => {
            // arrange
            getUserMedia.mockRejectedValueOnce(new DOMException('Missing device', 'NotFoundError'));
            await expect(recorder.start()).rejects.toMatchObject({
                code: 'device-not-found'
            });

            // act
            await recorder.start();

            // assert
            expect(recorder.error()).toBeNull();
            expect(recorder.state()).toBe('recording');
            expect(getUserMedia).toHaveBeenCalledTimes(2);
        });
    });

    describe('transcription', () => {
        it('transcribes a retained recording through the configured strategy', async () => {
            // arrange
            const transcriber = {
                transcribe: vi.fn().mockResolvedValue('recognized text')
            };
            TestBed.resetTestingModule();
            TestBed.configureTestingModule({
                providers: [
                    provideZonelessChangeDetection(),
                    { provide: VOICE_TRANSCRIBER, useValue: transcriber },
                    AudioRecorder
                ]
            });
            const transcribingRecorder = TestBed.inject(AudioRecorder);
            await transcribingRecorder.start();
            controller.emitChunk(new Blob(['voice'], { type: 'audio/webm' }));
            const stopPromise = transcribingRecorder.stop();
            controller.emitStop();
            await stopPromise;

            // act
            const text = await transcribingRecorder.transcribe('consultation.webm');

            // assert
            expect(text).toBe('recognized text');
            expect(transcriber.transcribe).toHaveBeenCalledWith({
                blob: expect.any(Blob),
                filename: 'consultation.webm',
                mimeType: 'audio/webm;codecs=opus'
            });
        });

        it('rejects transcription when streaming retention deliberately kept no final blob', async () => {
            // arrange
            await recorder.start({ retention: 'none' });
            controller.emitChunk(new Blob(['voice'], { type: 'audio/webm' }));
            const stopPromise = recorder.stop();
            controller.emitStop();
            await stopPromise;

            // act
            const transcription = recorder.transcribe();

            // assert
            await expect(transcription).rejects.toThrow('No retained audio');
        });
    });

    describe('dispose', () => {
        it('releases an active microphone and permanently closes the instance', async () => {
            // arrange
            await recorder.start();

            // act
            recorder.dispose();

            // assert
            expect(mediaStream.stopTrack).toHaveBeenCalledOnce();
            expect(recorder.mediaStream()).toBeNull();
            expect(recorder.state()).toBe('disposed');
            await expect(recorder.start()).rejects.toMatchObject({
                code: 'invalid-state'
            });
        });

        it('is safe to invoke repeatedly', () => {
            // arrange

            // act
            recorder.dispose();
            recorder.dispose();

            // assert
            expect(recorder.state()).toBe('disposed');
            expect(controller.stop).not.toHaveBeenCalled();
        });
    });
});
