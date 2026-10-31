// #region Imports

import { beforeEach, describe, expect, it } from 'vitest';
import { PCM_AUDIO_WORKLET_DEFINITION } from './PcmAudioWorkletDefinition';

// #endregion

interface IFakeWorkletMessagePort {
    onmessage: ((event: { readonly data: unknown }) => void) | null;
    readonly messages: Array<Record<string, unknown>>;
    dispatch(data: unknown): void;
    postMessage(message: Record<string, unknown>): void;
}

interface IWorkletProcessor {
    readonly port: IFakeWorkletMessagePort;
    process(
        inputs: ReadonlyArray<ReadonlyArray<Float32Array>>,
        outputs: ReadonlyArray<ReadonlyArray<Float32Array>>
    ): boolean;
}

interface IWorkletProcessorConstructor {
    new (options: { readonly processorOptions: Readonly<Record<string, number>> }): IWorkletProcessor;
}

function createMessagePort(): IFakeWorkletMessagePort {
    return {
        messages: [],
        onmessage: null,
        dispatch(data: unknown): void {
            this.onmessage?.({ data });
        },
        postMessage(message: Record<string, unknown>): void {
            this.messages.push(message);
        }
    };
}

function getProcessor(
    processors: ReadonlyMap<string, IWorkletProcessorConstructor>,
    name: string
): IWorkletProcessorConstructor {
    const processor = processors.get(name);

    if (!processor) {
        throw new Error(`Worklet processor ${name} was not registered.`);
    }

    return processor;
}

describe('realtime PCM worklet processors', () => {
    let processors: Map<string, IWorkletProcessorConstructor>;

    beforeEach(() => {
        processors = new Map<string, IWorkletProcessorConstructor>();

        class FakeAudioWorkletProcessor {
            public readonly port: IFakeWorkletMessagePort = createMessagePort();
        }

        const registerProcessor = (name: string, processor: IWorkletProcessorConstructor): void => {
            processors.set(name, processor);
        };
        const evaluateModule = new Function(
            'AudioWorkletProcessor',
            'registerProcessor',
            'sampleRate',
            PCM_AUDIO_WORKLET_DEFINITION.source
        ) as (
            processorBase: typeof FakeAudioWorkletProcessor,
            register: typeof registerProcessor,
            sampleRate: number
        ) => void;

        evaluateModule(FakeAudioWorkletProcessor, registerProcessor, 24_000);
    });

    describe('capture processor', () => {
        it('encodes bounded signed 16-bit little-endian frames', () => {
            // arrange
            const Processor = getProcessor(processors, PCM_AUDIO_WORKLET_DEFINITION.captureProcessorName);
            const processor = new Processor({
                processorOptions: {
                    channelCount: 1,
                    samplesPerFrame: 4
                }
            });

            // act
            processor.process([[new Float32Array([-1, -0.5, 0.5, 1])]], [[new Float32Array(4)]]);

            // assert
            expect(processor.port.messages).toHaveLength(1);
            expect(processor.port.messages[0]['type']).toBe('frame');
            expect(processor.port.messages[0]['sampleCount']).toBe(4);
            expect(Array.from(new Int16Array(processor.port.messages[0]['data'] as ArrayBuffer))).toEqual([
                -32_768, -16_384, 16_384, 32_767
            ]);
        });

        it('downmixes multiple microphone channels and flushes a partial frame', () => {
            // arrange
            const Processor = getProcessor(processors, PCM_AUDIO_WORKLET_DEFINITION.captureProcessorName);
            const processor = new Processor({
                processorOptions: {
                    channelCount: 1,
                    samplesPerFrame: 4
                }
            });
            processor.process([[new Float32Array([1, -1]), new Float32Array([-1, 1])]], [[new Float32Array(2)]]);

            // act
            processor.port.dispatch({ type: 'flush', requestId: 7 });

            // assert
            expect(processor.port.messages.map((message) => message['type'])).toEqual(['frame', 'flushed']);
            expect(Array.from(new Int16Array(processor.port.messages[0]['data'] as ArrayBuffer))).toEqual([0, 0]);
            expect(processor.port.messages[1]['requestId']).toBe(7);
        });

        it('duplicates mono input when an integration requests interleaved stereo frames', () => {
            // arrange
            const Processor = getProcessor(processors, PCM_AUDIO_WORKLET_DEFINITION.captureProcessorName);
            const processor = new Processor({
                processorOptions: {
                    channelCount: 2,
                    samplesPerFrame: 2
                }
            });

            // act
            processor.process([[new Float32Array([0.5, -0.5])]], [[new Float32Array(2)]]);

            // assert
            expect(Array.from(new Int16Array(processor.port.messages[0]['data'] as ArrayBuffer))).toEqual([
                16_384, 16_384, -16_384, -16_384
            ]);
        });
    });

    describe('playback processor', () => {
        it('buffers, decodes, and renders ordered PCM samples', () => {
            // arrange
            const Processor = getProcessor(processors, PCM_AUDIO_WORKLET_DEFINITION.playbackProcessorName);
            const processor = new Processor({
                processorOptions: {
                    channelCount: 1,
                    initialBufferSampleCount: 2,
                    maxBufferSampleCount: 8
                }
            });
            const payload = new Int16Array([-32_768, 0, 32_767]).buffer;
            processor.port.dispatch({ type: 'append', data: payload });
            const output = new Float32Array(4);

            // act
            processor.process([], [[output]]);

            // assert
            expect(Array.from(output)).toEqual([-1, 0, 1, 0]);
            expect(processor.port.messages.map((message) => message['type'])).toContain('playback-started');
            expect(processor.port.messages.map((message) => message['type'])).toContain('progress');
            expect(processor.port.messages.map((message) => message['type'])).toContain('underrun');
        });

        it('drains a short final response below the initial jitter threshold', () => {
            // arrange
            const Processor = getProcessor(processors, PCM_AUDIO_WORKLET_DEFINITION.playbackProcessorName);
            const processor = new Processor({
                processorOptions: {
                    channelCount: 1,
                    initialBufferSampleCount: 8,
                    maxBufferSampleCount: 16
                }
            });
            processor.port.dispatch({ type: 'append', data: new Int16Array([1, 2]).buffer });
            processor.port.dispatch({ type: 'flush', requestId: 9 });

            // act
            processor.process([], [[new Float32Array(4)]]);

            // assert
            const drained = processor.port.messages.find((message) => message['type'] === 'drained');
            expect(drained).toMatchObject({
                interrupted: false,
                requestId: 9,
                type: 'drained'
            });
        });

        it('renders interleaved stereo samples into independent output channels', () => {
            // arrange
            const Processor = getProcessor(processors, PCM_AUDIO_WORKLET_DEFINITION.playbackProcessorName);
            const processor = new Processor({
                processorOptions: {
                    channelCount: 2,
                    initialBufferSampleCount: 1,
                    maxBufferSampleCount: 4
                }
            });
            processor.port.dispatch({ type: 'append', data: new Int16Array([32_767, -32_768]).buffer });
            const leftOutput = new Float32Array(1);
            const rightOutput = new Float32Array(1);

            // act
            processor.process([], [[leftOutput, rightOutput]]);

            // assert
            expect(Array.from(leftOutput)).toEqual([1]);
            expect(Array.from(rightOutput)).toEqual([-1]);
        });

        it('rejects frames beyond the configured hard queue limit', () => {
            // arrange
            const Processor = getProcessor(processors, PCM_AUDIO_WORKLET_DEFINITION.playbackProcessorName);
            const processor = new Processor({
                processorOptions: {
                    channelCount: 1,
                    initialBufferSampleCount: 2,
                    maxBufferSampleCount: 4
                }
            });

            // act
            processor.port.dispatch({ type: 'append', data: new Int16Array(5).buffer });

            // assert
            expect(processor.port.messages).toContainEqual({
                rejectedSampleCount: 5,
                type: 'overflow'
            });
        });
    });
});
