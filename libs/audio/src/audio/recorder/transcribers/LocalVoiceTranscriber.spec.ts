import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalVoiceTranscriber } from './LocalVoiceTranscriber';
import { ITranscriptionInput } from './interfaces/ITranscriptionInput';

describe('LocalVoiceTranscriber', () => {
    let transcriber: LocalVoiceTranscriber;
    const originalWindow = globalThis.window;

    beforeEach(() => {
        transcriber = new LocalVoiceTranscriber({
            language: 'de-DE',
            interimResults: false,
            maxAlternatives: 1
        });
    });

    afterEach(() => {
        // Restore window
        if (originalWindow) {
            Object.defineProperty(globalThis, 'window', {
                value: originalWindow,
                writable: true,
                configurable: true
            });
        }
        vi.restoreAllMocks();
    });

    describe('transcribe', () => {
        it('should throw when SpeechRecognition API is not supported', async () => {
            // Provide a window without SpeechRecognition
            Object.defineProperty(globalThis, 'window', {
                value: {},
                writable: true,
                configurable: true
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            await expect(transcriber.transcribe(input)).rejects.toThrow('SpeechRecognition API not supported');
        });

        it('should configure recognition with provided language and return transcript', async () => {
            let capturedInstance: Record<string, unknown> = {};

            // Use a real class to avoid "not a constructor" errors
            class MockSpeechRecognition {
                public lang = '';
                public interimResults = true;
                public maxAlternatives = 5;
                public onresult: ((event: unknown) => void) | null = null;
                public onerror: ((event: unknown) => void) | null = null;

                public start(): void {
                    capturedInstance = this as unknown as Record<string, unknown>;
                    // Simulate async result
                    setTimeout(() => {
                        if (this.onresult) {
                            this.onresult({
                                results: [[{ transcript: 'Hallo Welt' }]]
                            });
                        }
                    }, 0);
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { SpeechRecognition: MockSpeechRecognition },
                writable: true,
                configurable: true
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            const result = await transcriber.transcribe(input);

            expect(capturedInstance['lang']).toBe('de-DE');
            expect(capturedInstance['interimResults']).toBe(false);
            expect(capturedInstance['maxAlternatives']).toBe(1);
            expect(result).toBe('Hallo Welt');
        });

        it('should reject on recognition error', async () => {
            class MockSpeechRecognition {
                public lang = '';
                public interimResults = false;
                public maxAlternatives = 1;
                public onresult: ((event: unknown) => void) | null = null;
                public onerror: ((event: unknown) => void) | null = null;

                public start(): void {
                    setTimeout(() => {
                        if (this.onerror) {
                            this.onerror({ error: 'not-allowed' });
                        }
                    }, 0);
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { SpeechRecognition: MockSpeechRecognition },
                writable: true,
                configurable: true
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            await expect(transcriber.transcribe(input)).rejects.toThrow('not-allowed');
        });

        it('should use webkit prefix if standard is not available', async () => {
            class MockWebkitSpeechRecognition {
                public lang = '';
                public interimResults = false;
                public maxAlternatives = 1;
                public onresult: ((event: unknown) => void) | null = null;
                public onerror: ((event: unknown) => void) | null = null;

                public start(): void {
                    setTimeout(() => {
                        if (this.onresult) {
                            this.onresult({
                                results: [[{ transcript: 'Webkit test' }]]
                            });
                        }
                    }, 0);
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { webkitSpeechRecognition: MockWebkitSpeechRecognition },
                writable: true,
                configurable: true
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            const result = await transcriber.transcribe(input);
            expect(result).toBe('Webkit test');
        });

        it('should keep a manual session active until explicitly stopped', async () => {
            class MockManualSpeechRecognition {
                public static instance: MockManualSpeechRecognition | null = null;

                public continuous = false;
                public interimResults = false;
                public lang = '';
                public maxAlternatives = 1;
                public onend: (() => void) | null = null;
                public onerror: ((event: unknown) => void) | null = null;
                public onresult: ((event: unknown) => void) | null = null;
                public onstart: (() => void) | null = null;
                public readonly abort = vi.fn();
                public readonly start = vi.fn(() => this.onstart?.());
                public readonly stop = vi.fn(() => this.onend?.());

                public constructor() {
                    MockManualSpeechRecognition.instance = this;
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { SpeechRecognition: MockManualSpeechRecognition },
                writable: true,
                configurable: true
            });

            await transcriber.startSession();
            const recognition = MockManualSpeechRecognition.instance;
            recognition?.onresult?.({
                resultIndex: 0,
                results: [Object.assign([{ transcript: 'Erster Satz' }], { isFinal: true })]
            });
            recognition?.onresult?.({
                resultIndex: 0,
                results: [Object.assign([{ transcript: 'zweiter Satz' }], { isFinal: true })]
            });

            const result = await transcriber.stopSession();

            expect(recognition).toMatchObject({
                continuous: true,
                interimResults: true,
                lang: 'de-DE'
            });
            expect(recognition?.start).toHaveBeenCalledOnce();
            expect(recognition?.stop).toHaveBeenCalledOnce();
            expect(result).toBe('Erster Satz zweiter Satz');
        });

        it('should restart a manual session when the browser ends it after a speech pause', async () => {
            class MockContinuousSpeechRecognition {
                public static instance: MockContinuousSpeechRecognition | null = null;

                public continuous = false;
                public interimResults = false;
                public lang = '';
                public maxAlternatives = 1;
                public onend: (() => void) | null = null;
                public onerror: ((event: unknown) => void) | null = null;
                public onresult: ((event: unknown) => void) | null = null;
                public onstart: (() => void) | null = null;
                public readonly abort = vi.fn();
                public readonly start = vi.fn(() => this.onstart?.());
                public readonly stop = vi.fn(() => this.onend?.());

                public constructor() {
                    MockContinuousSpeechRecognition.instance = this;
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { SpeechRecognition: MockContinuousSpeechRecognition },
                writable: true,
                configurable: true
            });

            await transcriber.startSession();
            const recognition = MockContinuousSpeechRecognition.instance;
            recognition?.onend?.();
            await Promise.resolve();

            expect(recognition?.start).toHaveBeenCalledTimes(2);

            transcriber.cancelSession();
            expect(recognition?.abort).toHaveBeenCalledOnce();
        });

        it('should use the Chrome dictation language pack and selected live audio track', async () => {
            const audioTrack = { readyState: 'live' } as MediaStreamTrack;
            const available = vi.fn().mockResolvedValue('available');
            const install = vi.fn();

            class MockLocalSpeechRecognition {
                public static available = available;
                public static install = install;
                public static instance: MockLocalSpeechRecognition | null = null;

                public continuous = false;
                public interimResults = false;
                public lang = '';
                public maxAlternatives = 1;
                public processLocally = false;
                public onend: (() => void) | null = null;
                public onerror: ((event: unknown) => void) | null = null;
                public onresult: ((event: unknown) => void) | null = null;
                public onstart: (() => void) | null = null;
                public readonly abort = vi.fn();
                public readonly start = vi.fn((audioTrack?: MediaStreamTrack) => {
                    void audioTrack;
                    this.onstart?.();
                });
                public readonly stop = vi.fn(() => this.onend?.());

                public constructor() {
                    MockLocalSpeechRecognition.instance = this;
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { SpeechRecognition: MockLocalSpeechRecognition },
                writable: true,
                configurable: true
            });

            await transcriber.startSession(audioTrack);
            const recognition = MockLocalSpeechRecognition.instance;

            expect(available).toHaveBeenCalledWith({
                langs: ['de-DE'],
                processLocally: true,
                quality: 'dictation'
            });
            expect(install).not.toHaveBeenCalled();
            expect(recognition?.processLocally).toBe(true);
            expect(recognition?.start).toHaveBeenCalledWith(audioTrack);

            transcriber.cancelSession();
        });

        it('should download a dictation language pack without delaying the current browser session', async () => {
            const available = vi.fn().mockResolvedValue('downloadable');
            const install = vi.fn().mockResolvedValue(true);

            class MockDownloadableSpeechRecognition {
                public static available = available;
                public static install = install;
                public static instance: MockDownloadableSpeechRecognition | null = null;

                public continuous = false;
                public interimResults = false;
                public lang = '';
                public maxAlternatives = 1;
                public processLocally = false;
                public onend: (() => void) | null = null;
                public onerror: ((event: unknown) => void) | null = null;
                public onresult: ((event: unknown) => void) | null = null;
                public onstart: (() => void) | null = null;
                public readonly abort = vi.fn();
                public readonly start = vi.fn(() => this.onstart?.());
                public readonly stop = vi.fn(() => this.onend?.());

                public constructor() {
                    MockDownloadableSpeechRecognition.instance = this;
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { SpeechRecognition: MockDownloadableSpeechRecognition },
                writable: true,
                configurable: true
            });

            await transcriber.startSession();

            expect(install).toHaveBeenCalledWith({
                langs: ['de-DE'],
                processLocally: true,
                quality: 'dictation'
            });
            expect(MockDownloadableSpeechRecognition.instance?.processLocally).toBe(false);

            transcriber.cancelSession();
        });

        it('should fall back to browser recognition when the local dictation pack is unavailable', async () => {
            const available = vi.fn().mockResolvedValue('unavailable');

            class MockRemoteSpeechRecognition {
                public static available = available;
                public static instance: MockRemoteSpeechRecognition | null = null;

                public continuous = false;
                public interimResults = false;
                public lang = '';
                public maxAlternatives = 1;
                public processLocally = true;
                public onend: (() => void) | null = null;
                public onerror: ((event: unknown) => void) | null = null;
                public onresult: ((event: unknown) => void) | null = null;
                public onstart: (() => void) | null = null;
                public readonly abort = vi.fn();
                public readonly start = vi.fn(() => this.onstart?.());
                public readonly stop = vi.fn(() => this.onend?.());

                public constructor() {
                    MockRemoteSpeechRecognition.instance = this;
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { SpeechRecognition: MockRemoteSpeechRecognition },
                writable: true,
                configurable: true
            });

            await transcriber.startSession();

            expect(MockRemoteSpeechRecognition.instance?.processLocally).toBe(false);

            transcriber.cancelSession();
        });

        it('should not start recognition after the user stops during language-pack preparation', async () => {
            let resolveAvailability!: (availability: 'available') => void;

            class MockPreparingSpeechRecognition {
                public static available = vi.fn(
                    () =>
                        new Promise<'available'>((resolve) => {
                            resolveAvailability = resolve;
                        })
                );
                public static instance: MockPreparingSpeechRecognition | null = null;

                public continuous = false;
                public interimResults = false;
                public lang = '';
                public maxAlternatives = 1;
                public processLocally = false;
                public readonly abort = vi.fn();
                public readonly start = vi.fn();
                public readonly stop = vi.fn();

                public constructor() {
                    MockPreparingSpeechRecognition.instance = this;
                }
            }

            Object.defineProperty(globalThis, 'window', {
                value: { SpeechRecognition: MockPreparingSpeechRecognition },
                writable: true,
                configurable: true
            });

            const startPromise = transcriber.startSession();
            const transcript = await transcriber.stopSession();
            resolveAvailability('available');
            await startPromise;

            expect(transcript).toBe('');
            expect(MockPreparingSpeechRecognition.instance).toBeNull();
        });

        it('should use default options when not provided', () => {
            const defaultTranscriber = new LocalVoiceTranscriber({});

            expect(defaultTranscriber).toBeInstanceOf(LocalVoiceTranscriber);
        });
    });
});
