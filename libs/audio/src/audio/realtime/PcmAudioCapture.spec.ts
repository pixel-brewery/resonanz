// #region Imports

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PcmAudioCapture } from './PcmAudioCapture';
import type { IPcmAudioFrame } from './models/IPcmAudioFrame';
import { RealtimeAudioWorkletModuleLoader } from './worklets/RealtimeAudioWorkletModuleLoader';

// #endregion

interface IAudioContextController {
    readonly close: ReturnType<typeof vi.fn>;
    readonly context: AudioContext;
    readonly createGain: ReturnType<typeof vi.fn>;
    readonly createMediaStreamSource: ReturnType<typeof vi.fn>;
    readonly gainDisconnect: ReturnType<typeof vi.fn>;
    readonly resume: ReturnType<typeof vi.fn>;
    readonly sourceDisconnect: ReturnType<typeof vi.fn>;
    readonly suspend: ReturnType<typeof vi.fn>;
}

interface IDeferred<T> {
    readonly promise: Promise<T>;
    readonly resolve: (value: T) => void;
}

interface IMediaStreamController {
    endTrack(): void;
    readonly stopTrack: ReturnType<typeof vi.fn>;
    readonly stream: MediaStream;
}

interface IMessagePortController {
    emit(data: unknown): void;
    emitMessageError(): void;
    readonly port: MessagePort;
    readonly postMessage: ReturnType<typeof vi.fn>;
}

interface IWorkletNodeController {
    emitProcessorError(): void;
    readonly addEventListener: ReturnType<typeof vi.fn>;
    readonly connect: ReturnType<typeof vi.fn>;
    readonly disconnect: ReturnType<typeof vi.fn>;
    readonly node: AudioWorkletNode;
    readonly port: IMessagePortController;
    readonly removeEventListener: ReturnType<typeof vi.fn>;
}

function createAudioContextController(): IAudioContextController {
    let state: AudioContextState = 'suspended';
    const sourceDisconnect = vi.fn();
    const sourceNode = {
        connect: vi.fn(),
        disconnect: sourceDisconnect
    } as unknown as MediaStreamAudioSourceNode;
    const gainDisconnect = vi.fn();
    const gainNode = {
        connect: vi.fn(),
        disconnect: gainDisconnect,
        gain: {
            setValueAtTime: vi.fn(),
            value: 1
        }
    } as unknown as GainNode;
    const resume = vi.fn(async (): Promise<void> => {
        state = 'running';
    });
    const suspend = vi.fn(async (): Promise<void> => {
        state = 'suspended';
    });
    const close = vi.fn(async (): Promise<void> => {
        state = 'closed';
    });
    const createMediaStreamSource = vi.fn(() => sourceNode);
    const createGain = vi.fn(() => gainNode);
    const context = {
        audioWorklet: {
            addModule: vi.fn()
        },
        close,
        createGain,
        createMediaStreamSource,
        currentTime: 0,
        destination: {} as AudioDestinationNode,
        get state(): AudioContextState {
            return state;
        },
        resume,
        sampleRate: 24_000,
        suspend
    } as unknown as AudioContext;

    return {
        close,
        context,
        createGain,
        createMediaStreamSource,
        gainDisconnect,
        resume,
        sourceDisconnect,
        suspend
    };
}

function createDeferred<T>(): IDeferred<T> {
    let resolvePromise: (value: T) => void = () => undefined;
    const promise = new Promise<T>((resolve) => {
        resolvePromise = resolve;
    });

    return {
        promise,
        resolve: resolvePromise
    };
}

function createMediaStreamController(): IMediaStreamController {
    let readyState: MediaStreamTrackState = 'live';
    const trackEvents = new EventTarget();
    const stopTrack = vi.fn();
    const track = {
        addEventListener: trackEvents.addEventListener.bind(trackEvents),
        get readyState(): MediaStreamTrackState {
            return readyState;
        },
        removeEventListener: trackEvents.removeEventListener.bind(trackEvents),
        stop: stopTrack
    } as unknown as MediaStreamTrack;
    const stream = {
        getAudioTracks: vi.fn(() => [track]),
        getTracks: vi.fn(() => [track])
    } as unknown as MediaStream;

    return {
        endTrack(): void {
            readyState = 'ended';
            trackEvents.dispatchEvent(new Event('ended'));
        },
        stopTrack,
        stream
    };
}

function createMessagePortController(): IMessagePortController {
    let onmessage: MessagePort['onmessage'] = null;
    let onmessageerror: MessagePort['onmessageerror'] = null;
    const postMessage = vi.fn();
    const port = {
        get onmessage(): MessagePort['onmessage'] {
            return onmessage;
        },
        set onmessage(handler: MessagePort['onmessage']) {
            onmessage = handler;
        },
        get onmessageerror(): MessagePort['onmessageerror'] {
            return onmessageerror;
        },
        set onmessageerror(handler: MessagePort['onmessageerror']) {
            onmessageerror = handler;
        },
        postMessage
    } as unknown as MessagePort;

    return {
        emit(data: unknown): void {
            onmessage?.call(port, new MessageEvent('message', { data }));
        },
        emitMessageError(): void {
            onmessageerror?.call(port, new MessageEvent('messageerror'));
        },
        port,
        postMessage
    };
}

function createWorkletNodeController(): IWorkletNodeController {
    const port = createMessagePortController();
    const processorErrorListeners = new Set<EventListener>();
    const addEventListener = vi.fn((type: string, listener: EventListener): void => {
        if (type === 'processorerror') {
            processorErrorListeners.add(listener);
        }
    });
    const removeEventListener = vi.fn((type: string, listener: EventListener): void => {
        if (type === 'processorerror') {
            processorErrorListeners.delete(listener);
        }
    });
    const connect = vi.fn();
    const disconnect = vi.fn();
    const node = {
        addEventListener,
        connect,
        disconnect,
        port: port.port,
        removeEventListener
    } as unknown as AudioWorkletNode;

    return {
        emitProcessorError(): void {
            for (const listener of processorErrorListeners) {
                listener(new Event('processorerror'));
            }
        },
        addEventListener,
        connect,
        disconnect,
        node,
        port,
        removeEventListener
    };
}

describe('realtime PCM capture', () => {
    let audioContext: IAudioContextController;
    let capture: PcmAudioCapture;
    let mediaStream: IMediaStreamController;
    let workletLoader: { readonly load: ReturnType<typeof vi.fn> };
    let workletNode: IWorkletNodeController;

    beforeEach(() => {
        audioContext = createAudioContextController();
        mediaStream = createMediaStreamController();
        workletNode = createWorkletNodeController();
        workletLoader = {
            load: vi.fn().mockResolvedValue(undefined)
        };

        class FakeAudioContext {
            public constructor(options?: AudioContextOptions) {
                Object.defineProperty(audioContext.context, 'sampleRate', {
                    configurable: true,
                    value: options?.sampleRate ?? 24_000
                });

                return audioContext.context as unknown as FakeAudioContext;
            }
        }

        class FakeAudioWorkletNode {
            public constructor() {
                return workletNode.node as unknown as FakeAudioWorkletNode;
            }
        }

        vi.stubGlobal('AudioContext', FakeAudioContext);
        vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);

        TestBed.configureTestingModule({
            providers: [
                provideZonelessChangeDetection(),
                {
                    provide: RealtimeAudioWorkletModuleLoader,
                    useValue: workletLoader
                },
                PcmAudioCapture
            ]
        });
        capture = TestBed.inject(PcmAudioCapture);
    });

    afterEach(() => {
        TestBed.resetTestingModule();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('starting and frame production', () => {
        it('attaches a 24 kHz worklet graph without taking ownership of microphone tracks', async () => {
            // arrange

            // act
            await capture.start(mediaStream.stream);

            // assert
            expect(capture.state()).toBe('capturing');
            expect(capture.mediaStream()).toBe(mediaStream.stream);
            expect(capture.format()).toEqual({
                channelCount: 1,
                encoding: 'pcm-s16le',
                sampleRateHz: 24_000
            });
            expect(workletLoader.load).toHaveBeenCalledWith(audioContext.context);
            expect(audioContext.createMediaStreamSource).toHaveBeenCalledWith(mediaStream.stream);
            expect(mediaStream.stopTrack).not.toHaveBeenCalled();
        });

        it('publishes ordered transport-neutral frames with sample-derived timestamps', async () => {
            // arrange
            const frames: IPcmAudioFrame[] = [];
            capture.frameAvailable.subscribe((frame) => frames.push(frame));
            await capture.start(mediaStream.stream, { frameDurationMs: 20 });
            const firstPayload = new Int16Array(480).buffer;
            const secondPayload = new Int16Array(240).buffer;

            // act
            workletNode.port.emit({ type: 'frame', data: firstPayload, sampleCount: 480 });
            workletNode.port.emit({ type: 'frame', data: secondPayload, sampleCount: 240 });

            // assert
            expect(frames).toHaveLength(2);
            expect(frames.map((frame) => frame.sequence)).toEqual([0, 1]);
            expect(frames.map((frame) => frame.durationMs)).toEqual([20, 10]);
            expect(frames[1].timestampMs - frames[0].timestampMs).toBeCloseTo(20, 10);
            expect(capture.latestFrame()).toBe(frames[1]);
        });

        it('rejects streams without a live audio track before allocating browser resources', async () => {
            // arrange
            const invalidStream = {
                getAudioTracks: vi.fn(() => [])
            } as unknown as MediaStream;

            // act
            const startPromise = capture.start(invalidStream);

            // assert
            await expect(startPromise).rejects.toMatchObject({ code: 'invalid-stream' });
            expect(workletLoader.load).not.toHaveBeenCalled();
        });
    });

    describe('pause, resume, and stop', () => {
        it('suspends and resumes worklet processing without replacing the graph', async () => {
            // arrange
            await capture.start(mediaStream.stream);

            // act
            await capture.pause();
            await capture.resume();

            // assert
            expect(audioContext.suspend).toHaveBeenCalledOnce();
            expect(audioContext.resume).toHaveBeenCalledTimes(2);
            expect(capture.state()).toBe('capturing');
            expect(audioContext.createMediaStreamSource).toHaveBeenCalledOnce();
        });

        it('waits for the final partial frame before releasing only owned Web Audio resources', async () => {
            // arrange
            const frames: IPcmAudioFrame[] = [];
            capture.frameAvailable.subscribe((frame) => frames.push(frame));
            await capture.start(mediaStream.stream);

            // act
            const stopPromise = capture.stop();
            const flushMessage = workletNode.port.postMessage.mock.calls.at(-1)?.[0] as {
                readonly requestId: number;
            };
            workletNode.port.emit({ type: 'frame', data: new Int16Array(120).buffer, sampleCount: 120 });
            workletNode.port.emit({ type: 'flushed', requestId: flushMessage.requestId });
            await stopPromise;

            // assert
            expect(frames).toHaveLength(1);
            expect(capture.state()).toBe('idle');
            expect(capture.mediaStream()).toBeNull();
            expect(audioContext.close).toHaveBeenCalledOnce();
            expect(audioContext.sourceDisconnect).toHaveBeenCalledOnce();
            expect(workletNode.disconnect).toHaveBeenCalledOnce();
            expect(mediaStream.stopTrack).not.toHaveBeenCalled();
        });
    });

    describe('failure and cleanup', () => {
        it('keeps a cancelled start isolated until its delayed worklet load settles', async () => {
            // arrange
            const workletLoad = createDeferred<void>();
            workletLoader.load.mockReturnValueOnce(workletLoad.promise);
            const startPromise = capture.start(mediaStream.stream);

            // act
            const stopPromise = capture.stop();
            const overlappingStart = capture.start(mediaStream.stream);
            const overlappingStartAssertion = expect(overlappingStart).rejects.toMatchObject({
                code: 'invalid-state'
            });
            workletLoad.resolve(undefined);
            await Promise.all([startPromise, stopPromise]);

            // assert
            await overlappingStartAssertion;
            expect(capture.state()).toBe('idle');
            expect(audioContext.close).toHaveBeenCalledOnce();
            expect(mediaStream.stopTrack).not.toHaveBeenCalled();
        });

        it('surfaces worklet loading failures without stopping external tracks', async () => {
            // arrange
            workletLoader.load.mockRejectedValueOnce(new Error('blocked by policy'));

            // act
            const startPromise = capture.start(mediaStream.stream);

            // assert
            await expect(startPromise).rejects.toMatchObject({ code: 'worklet-load-failed' });
            expect(capture.state()).toBe('error');
            expect(audioContext.close).toHaveBeenCalledOnce();
            expect(mediaStream.stopTrack).not.toHaveBeenCalled();
        });

        it('fails loudly when every externally owned audio track ends', async () => {
            // arrange
            await capture.start(mediaStream.stream);

            // act
            mediaStream.endTrack();
            await Promise.resolve();

            // assert
            expect(capture.error()?.code).toBe('invalid-stream');
            expect(capture.state()).toBe('error');
            expect(mediaStream.stopTrack).not.toHaveBeenCalled();
        });

        it('rejects reuse after permanent disposal', async () => {
            // arrange
            capture.dispose();

            // act
            const startPromise = capture.start(mediaStream.stream);

            // assert
            await expect(startPromise).rejects.toMatchObject({ code: 'invalid-state' });
        });
    });
});
