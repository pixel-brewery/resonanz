// #region Imports

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PcmAudioStreamPlayer } from './PcmAudioStreamPlayer';
import type { IPcmAudioFrame } from './models/IPcmAudioFrame';
import { RealtimeAudioWorkletModuleLoader } from './worklets/RealtimeAudioWorkletModuleLoader';

// #endregion

interface IAudioContextController {
    readonly close: ReturnType<typeof vi.fn>;
    readonly context: AudioContext;
    readonly gainDisconnect: ReturnType<typeof vi.fn>;
    readonly resume: ReturnType<typeof vi.fn>;
    readonly setValueAtTime: ReturnType<typeof vi.fn>;
    readonly suspend: ReturnType<typeof vi.fn>;
}

interface IDeferred<T> {
    readonly promise: Promise<T>;
    readonly resolve: (value: T) => void;
}

interface IMessagePortController {
    emit(data: unknown): void;
    readonly port: MessagePort;
    readonly postMessage: ReturnType<typeof vi.fn>;
}

interface IWorkletNodeController {
    emitProcessorError(): void;
    readonly connect: ReturnType<typeof vi.fn>;
    readonly disconnect: ReturnType<typeof vi.fn>;
    readonly node: AudioWorkletNode;
    readonly port: IMessagePortController;
}

const DEFAULT_FORMAT = Object.freeze({
    channelCount: 1,
    encoding: 'pcm-s16le',
    sampleRateHz: 24_000
} as const);

function createAudioContextController(): IAudioContextController {
    let state: AudioContextState = 'suspended';
    const setValueAtTime = vi.fn();
    const gainDisconnect = vi.fn();
    const gainNode = {
        connect: vi.fn(),
        disconnect: gainDisconnect,
        gain: {
            setValueAtTime,
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
    const context = {
        audioWorklet: {
            addModule: vi.fn()
        },
        close,
        createGain: vi.fn(() => gainNode),
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
        gainDisconnect,
        resume,
        setValueAtTime,
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
        port,
        postMessage
    };
}

function createWorkletNodeController(): IWorkletNodeController {
    const port = createMessagePortController();
    const processorErrorListeners = new Set<EventListener>();
    const connect = vi.fn();
    const disconnect = vi.fn();
    const node = {
        addEventListener: vi.fn((type: string, listener: EventListener): void => {
            if (type === 'processorerror') {
                processorErrorListeners.add(listener);
            }
        }),
        connect,
        disconnect,
        port: port.port,
        removeEventListener: vi.fn((type: string, listener: EventListener): void => {
            if (type === 'processorerror') {
                processorErrorListeners.delete(listener);
            }
        })
    } as unknown as AudioWorkletNode;

    return {
        emitProcessorError(): void {
            for (const listener of processorErrorListeners) {
                listener(new Event('processorerror'));
            }
        },
        connect,
        disconnect,
        node,
        port
    };
}

function createFrame(sequence: number, sampleCount = 480): IPcmAudioFrame {
    return {
        data: new Int16Array(sampleCount).buffer,
        durationMs: (sampleCount / DEFAULT_FORMAT.sampleRateHz) * 1_000,
        format: DEFAULT_FORMAT,
        sequence,
        timestampMs: sequence * 20
    };
}

describe('bounded realtime PCM playback', () => {
    let audioContext: IAudioContextController;
    let player: PcmAudioStreamPlayer;
    let workletLoader: { readonly load: ReturnType<typeof vi.fn> };
    let workletNode: IWorkletNodeController;

    beforeEach(() => {
        audioContext = createAudioContextController();
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
                PcmAudioStreamPlayer
            ]
        });
        player = TestBed.inject(PcmAudioStreamPlayer);
    });

    afterEach(() => {
        TestBed.resetTestingModule();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('initialization and ordered playback', () => {
        it('creates an empty interactive graph for the configured PCM format', async () => {
            // arrange

            // act
            await player.start();

            // assert
            expect(player.state()).toBe('ready');
            expect(player.format()).toEqual(DEFAULT_FORMAT);
            expect(player.bufferedDurationMs()).toBe(0);
            expect(workletLoader.load).toHaveBeenCalledWith(audioContext.context);
            expect(workletNode.connect).toHaveBeenCalledOnce();
            expect(audioContext.resume).toHaveBeenCalledOnce();
        });

        it('requests browser audio activation before asynchronous worklet registration settles', async () => {
            const workletLoad = createDeferred<void>();
            workletLoader.load.mockReturnValueOnce(workletLoad.promise);

            const startPromise = player.start();

            expect(audioContext.resume).toHaveBeenCalledOnce();
            expect(player.state()).toBe('starting');
            workletLoad.resolve(undefined);
            await startPromise;
            expect(player.state()).toBe('ready');
        });

        it('copies caller-owned frames into the bounded worklet queue', async () => {
            // arrange
            await player.start();
            const frame = createFrame(0);

            // act
            player.append(frame);

            // assert
            const appendMessage = workletNode.port.postMessage.mock.calls.at(-1)?.[0] as {
                readonly data: ArrayBuffer;
                readonly type: string;
            };
            expect(appendMessage.type).toBe('append');
            expect(appendMessage.data).not.toBe(frame.data);
            expect(appendMessage.data.byteLength).toBe(frame.data.byteLength);
            expect(frame.data.byteLength).toBe(960);
            expect(player.bufferedDurationMs()).toBe(20);
            expect(player.state()).toBe('buffering');
        });

        it('reflects worklet playback and buffer progress without transport coupling', async () => {
            // arrange
            await player.start();
            player.append(createFrame(0));

            // act
            workletNode.port.emit({ type: 'playback-started' });
            workletNode.port.emit({ type: 'progress', bufferedSampleCount: 240, consumedSampleCount: 240 });

            // assert
            expect(player.state()).toBe('playing');
            expect(player.isPlaying()).toBe(true);
            expect(player.bufferedDurationMs()).toBe(10);
        });
    });

    describe('drain and interruption', () => {
        it('flushes a response and accepts a new sequence only after every sample drained', async () => {
            // arrange
            await player.start();
            player.append(createFrame(0, 240));

            // act
            const flushPromise = player.flush();
            const flushMessage = workletNode.port.postMessage.mock.calls.at(-1)?.[0] as {
                readonly requestId: number;
            };
            workletNode.port.emit({ type: 'playback-started' });
            workletNode.port.emit({ type: 'progress', bufferedSampleCount: 0, consumedSampleCount: 240 });
            workletNode.port.emit({ type: 'drained', requestId: flushMessage.requestId, interrupted: false });
            await flushPromise;
            player.append(createFrame(0));

            // assert
            expect(player.state()).toBe('buffering');
            expect(player.bufferedDurationMs()).toBe(20);
            expect(workletNode.port.postMessage).toHaveBeenLastCalledWith(
                expect.objectContaining({ type: 'append' }),
                expect.any(Array)
            );
        });

        it('clears queued output immediately and keeps the graph reusable', async () => {
            // arrange
            await player.start();
            player.append(createFrame(0));

            // act
            const clearPromise = player.clear();
            const clearMessage = workletNode.port.postMessage.mock.calls.at(-1)?.[0] as {
                readonly requestId: number;
            };
            workletNode.port.emit({ type: 'cleared', requestId: clearMessage.requestId, discardedSampleCount: 480 });
            await clearPromise;

            // assert
            expect(player.state()).toBe('ready');
            expect(player.bufferedDurationMs()).toBe(0);
            expect(player.isPlaying()).toBe(false);
        });
    });

    describe('output controls', () => {
        it('pauses and resumes without discarding queued samples', async () => {
            // arrange
            await player.start();
            player.append(createFrame(0));

            // act
            await player.pause();
            await player.resume();

            // assert
            expect(audioContext.suspend).toHaveBeenCalledOnce();
            expect(audioContext.resume).toHaveBeenCalledTimes(2);
            expect(player.state()).toBe('buffering');
            expect(player.bufferedDurationMs()).toBe(20);
        });

        it('combines retained volume with independent mute state', async () => {
            // arrange
            await player.start({ volume: 0.75 });

            // act
            player.setMuted(true);
            player.setVolume(0.5);
            player.setMuted(false);

            // assert
            expect(player.volume()).toBe(0.5);
            expect(player.isMuted()).toBe(false);
            expect(audioContext.setValueAtTime.mock.calls.map((call) => call[0])).toEqual([0.75, 0, 0, 0.5]);
        });
    });

    describe('invalid input and resource failures', () => {
        it('keeps a cancelled initialization isolated until its delayed worklet load settles', async () => {
            // arrange
            const workletLoad = createDeferred<void>();
            workletLoader.load.mockReturnValueOnce(workletLoad.promise);
            const startPromise = player.start();

            // act
            const stopPromise = player.stop();
            const overlappingStart = player.start();
            const overlappingStartAssertion = expect(overlappingStart).rejects.toMatchObject({
                code: 'invalid-state'
            });
            workletLoad.resolve(undefined);
            await Promise.all([startPromise, stopPromise]);

            // assert
            await overlappingStartAssertion;
            expect(player.state()).toBe('idle');
            expect(audioContext.close).toHaveBeenCalledOnce();
        });

        it('rejects duplicate or out-of-order frames without mutating the queue', async () => {
            // arrange
            await player.start();
            player.append(createFrame(0));

            // act
            const appendDuplicate = (): void => player.append(createFrame(0));

            // assert
            expect(appendDuplicate).toThrow(expect.objectContaining({ code: 'out-of-order-frame' }));
            expect(player.bufferedDurationMs()).toBe(20);
            expect(workletNode.port.postMessage).toHaveBeenCalledTimes(1);
        });

        it('rejects frames before exceeding the configured latency and memory bound', async () => {
            // arrange
            await player.start({ initialBufferDurationMs: 0, maxBufferDurationMs: 20 });
            player.append(createFrame(0));

            // act
            const appendOverflow = (): void => player.append(createFrame(1, 1));

            // assert
            expect(appendOverflow).toThrow(expect.objectContaining({ code: 'queue-overflow' }));
            expect(player.bufferedDurationMs()).toBe(20);
            expect(workletNode.port.postMessage).toHaveBeenCalledTimes(1);
        });

        it('fails loudly and releases resources when the worklet processor crashes', async () => {
            // arrange
            await player.start();

            // act
            workletNode.emitProcessorError();
            await Promise.resolve();

            // assert
            expect(player.error()?.code).toBe('playback-failed');
            expect(player.state()).toBe('error');
            expect(audioContext.close).toHaveBeenCalledOnce();
        });

        it('cannot restart after permanent disposal', async () => {
            // arrange
            player.dispose();

            // act
            const startPromise = player.start();

            // assert
            await expect(startPromise).rejects.toMatchObject({ code: 'invalid-state' });
        });
    });
});
