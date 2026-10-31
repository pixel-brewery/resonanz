// #region Imports

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioInputDeviceError } from './errors/AudioInputDeviceError';
import { AudioInputDeviceService } from './AudioInputDeviceService';

// #endregion

interface IMockMediaStream {
    readonly stopTrack: ReturnType<typeof vi.fn>;
    readonly stream: MediaStream;
}

interface IMockWebAudio {
    amplitude: number;
    readonly close: ReturnType<typeof vi.fn>;
    readonly disconnect: ReturnType<typeof vi.fn>;
    failure: Error | null;
}

function createMockMediaStream(): IMockMediaStream {
    const stopTrack = vi.fn();
    const track = {
        kind: 'audio',
        stop: stopTrack
    } as unknown as MediaStreamTrack;

    return {
        stopTrack,
        stream: {
            getTracks: vi.fn(() => [track])
        } as unknown as MediaStream
    };
}

function installAudioContext(): IMockWebAudio {
    const controller: IMockWebAudio = {
        amplitude: 0.08,
        close: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        failure: null
    };
    const analyser = {
        fftSize: 2_048,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData: vi.fn((buffer: Float32Array<ArrayBuffer>) => {
            if (controller.failure) {
                throw controller.failure;
            }

            buffer.fill(controller.amplitude);
        })
    } as unknown as AnalyserNode;
    const source = {
        connect: vi.fn(),
        disconnect: controller.disconnect
    } as unknown as MediaStreamAudioSourceNode;

    class FakeAudioContext {
        public readonly state = 'running';

        public readonly close = controller.close;

        public readonly resume = vi.fn().mockResolvedValue(undefined);

        public createAnalyser(): AnalyserNode {
            return analyser;
        }

        public createMediaStreamSource(): MediaStreamAudioSourceNode {
            return source;
        }
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);

    return controller;
}

describe('AudioInputDeviceService', () => {
    let addEventListener: ReturnType<typeof vi.fn>;
    let enumerateDevices: ReturnType<typeof vi.fn>;
    let getUserMedia: ReturnType<typeof vi.fn>;
    let removeEventListener: ReturnType<typeof vi.fn>;
    let service: AudioInputDeviceService;
    let webAudio: IMockWebAudio;

    beforeEach(() => {
        addEventListener = vi.fn();
        enumerateDevices = vi.fn().mockResolvedValue([
            {
                deviceId: 'microphone-1',
                groupId: 'group-1',
                kind: 'audioinput',
                label: 'Desk microphone'
            },
            {
                deviceId: 'speaker-1',
                groupId: 'group-2',
                kind: 'audiooutput',
                label: 'Desk speakers'
            }
        ] as MediaDeviceInfo[]);
        getUserMedia = vi.fn();
        removeEventListener = vi.fn();

        vi.stubGlobal('navigator', {
            mediaDevices: {
                addEventListener,
                enumerateDevices,
                getUserMedia,
                removeEventListener
            }
        });
        webAudio = installAudioContext();
        vi.useFakeTimers();

        TestBed.configureTestingModule({
            providers: [provideZonelessChangeDetection(), AudioInputDeviceService]
        });
        service = TestBed.inject(AudioInputDeviceService);
    });

    afterEach(() => {
        TestBed.resetTestingModule();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('discovers only audio-input devices and infers granted access from visible labels', async () => {
        // arrange

        // act
        await service.initialize();

        // assert
        expect(service.devices()).toEqual([
            {
                deviceId: 'microphone-1',
                groupId: 'group-1',
                label: 'Desk microphone'
            }
        ]);
        expect(service.permissionState()).toBe('granted');
        expect(addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
    });

    it('requests permission without retaining the temporary browser stream', async () => {
        // arrange
        const temporaryStream = createMockMediaStream();

        getUserMedia.mockResolvedValue(temporaryStream.stream);

        // act
        await service.requestPermission();

        // assert
        expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
        expect(temporaryStream.stopTrack).toHaveBeenCalledOnce();
        expect(service.mediaStream()).toBeNull();
        expect(service.permissionState()).toBe('granted');
    });

    it('verifies a selected microphone after consecutive usable signal samples', async () => {
        // arrange
        const testStream = createMockMediaStream();

        getUserMedia.mockResolvedValue(testStream.stream);

        // act
        await service.startTest('microphone-1');
        await vi.advanceTimersByTimeAsync(200);

        // assert
        expect(getUserMedia).toHaveBeenCalledWith({
            audio: {
                autoGainControl: true,
                deviceId: { exact: 'microphone-1' },
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        expect(service.signalQuality()).toBe('good');
        expect(service.testedDeviceId()).toBe('microphone-1');
        expect(service.testState()).toBe('passed');

        service.stopTest();

        expect(testStream.stopTrack).toHaveBeenCalledOnce();
        expect(service.mediaStream()).toBeNull();
        expect(service.testState()).toBe('passed');
    });

    it('maps blocked permission to a stable typed failure', async () => {
        // arrange
        getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

        // act
        const permissionRequest = service.requestPermission();

        // assert
        await expect(permissionRequest).rejects.toMatchObject<AudioInputDeviceError>({
            code: 'permission-denied'
        });
        expect(service.permissionState()).toBe('denied');
    });

    it('releases the acquired stream when initial signal analysis fails', async () => {
        // arrange
        const testStream = createMockMediaStream();

        getUserMedia.mockResolvedValue(testStream.stream);
        webAudio.failure = new Error('Analysis failed');

        // act
        const testStart = service.startTest('microphone-1');

        // assert
        await expect(testStart).rejects.toMatchObject<AudioInputDeviceError>({
            code: 'analysis-failed'
        });
        expect(testStream.stopTrack).toHaveBeenCalledOnce();
        expect(service.mediaStream()).toBeNull();
        expect(service.testState()).toBe('error');
    });
});
