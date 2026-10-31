import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from './AudioPlayer';

// #region Mocks

function createMockAudioElement(): HTMLAudioElement & {
    listeners: Record<string, Array<(...args: unknown[]) => void>>;
} {
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    const el = {
        listeners,
        src: '',
        currentTime: 0,
        duration: 0,
        volume: 1,
        muted: false,
        loop: false,
        srcObject: null as MediaProvider | null,
        paused: true,
        preload: 'auto',
        crossOrigin: 'anonymous',
        error: null as MediaError | null,
        load: vi.fn(),
        play: vi.fn().mockImplementation(async () => {
            el.paused = false;
            const playHandlers = listeners['play'];
            if (playHandlers) {
                for (const fn of playHandlers) fn();
            }
        }),
        pause: vi.fn().mockImplementation(() => {
            el.paused = true;
            const pauseHandlers = listeners['pause'];
            if (pauseHandlers) {
                for (const fn of pauseHandlers) fn();
            }
        }),
        addEventListener: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
        }),
        removeEventListener: vi.fn(),
        replaceWith: vi.fn(),
        cloneNode: vi.fn().mockReturnValue({})
    } as unknown as HTMLAudioElement & { listeners: Record<string, Array<(...args: unknown[]) => void>> };

    return el;
}

function createMockMediaStream(): {
    readonly stream: MediaStream;
    readonly stopTrack: ReturnType<typeof vi.fn>;
} {
    const stopTrack = vi.fn();
    const track = {
        enabled: true,
        kind: 'audio',
        stop: stopTrack
    } as unknown as MediaStreamTrack;
    const stream = {
        getAudioTracks: vi.fn(() => [track]),
        getTracks: vi.fn(() => [track])
    } as unknown as MediaStream;

    return {
        stream,
        stopTrack
    };
}

// #endregion

describe('AudioPlayer', () => {
    let player: AudioPlayer;
    let mockAudioElement: ReturnType<typeof createMockAudioElement>;

    beforeEach(() => {
        mockAudioElement = createMockAudioElement();

        // Mock Audio constructor — must be a real class so `new Audio()` works
        class FakeAudio {
            public constructor() {
                return mockAudioElement as unknown as FakeAudio;
            }
        }
        (globalThis as unknown as { Audio: unknown }).Audio = FakeAudio;

        // Mock URL
        globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
        globalThis.URL.revokeObjectURL = vi.fn();

        // Mock requestAnimationFrame
        vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1);
        vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);

        TestBed.configureTestingModule({
            providers: [provideZonelessChangeDetection(), AudioPlayer]
        });

        player = TestBed.inject(AudioPlayer);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('initial state', () => {
        it('should have isPlaying as false', () => {
            expect(player.isPlaying()).toBe(false);
        });

        it('should have isPaused as false', () => {
            expect(player.isPaused()).toBe(false);
        });

        it('should have currentTime as 0', () => {
            expect(player.currentTime()).toBe(0);
        });

        it('should have duration as 0', () => {
            expect(player.duration()).toBe(0);
        });

        it('should have volume as 1', () => {
            expect(player.volume()).toBe(1);
        });

        it('should have loop as false', () => {
            expect(player.loop()).toBe(false);
        });

        it('should have error as null', () => {
            expect(player.error()).toBeNull();
        });

        it('should have sourceUrl as null', () => {
            expect(player.sourceUrl()).toBeNull();
        });

        it('should have timeLabel as "00:00 / 00:00"', () => {
            expect(player.timeLabel()).toBe('00:00 / 00:00');
        });
    });

    describe('load', () => {
        it('should set source URL from string', () => {
            player.load({ src: 'https://example.com/audio.mp3' });

            expect(player.sourceUrl()).toBe('https://example.com/audio.mp3');
            expect(mockAudioElement.src).toBe('https://example.com/audio.mp3');
        });

        it('should create object URL from Blob', () => {
            const blob = new Blob(['data'], { type: 'audio/webm' });
            player.load({ src: blob });

            expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob);
            expect(player.sourceUrl()).toBe('blob:test-url');
        });

        it('should call audio element load', () => {
            player.load({ src: 'https://example.com/audio.mp3' });

            expect(mockAudioElement.load).toHaveBeenCalled();
        });

        it('should reset playback state', () => {
            player.load({ src: 'https://example.com/audio.mp3' });

            expect(player.isPlaying()).toBe(false);
            expect(player.isPaused()).toBe(false);
            expect(player.currentTime()).toBe(0);
            expect(player.duration()).toBe(0);
        });

        it('should clear previous error', () => {
            player.load({ src: 'https://example.com/audio.mp3' });

            expect(player.error()).toBeNull();
        });
    });

    describe('play', () => {
        it('should call play on the audio element', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });

            expect(mockAudioElement.play).toHaveBeenCalled();
        });

        it('should set isPlaying to true', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });

            expect(player.isPlaying()).toBe(true);
        });

        it('should set isPaused to false', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });

            expect(player.isPaused()).toBe(false);
        });

        it('should apply volume option', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' }, { volume: 0.5 });

            expect(player.volume()).toBe(0.5);
            expect(mockAudioElement.volume).toBe(0.5);
        });

        it('should clamp volume to [0, 1]', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' }, { volume: 2.0 });

            expect(player.volume()).toBe(1);
        });

        it('should apply loop option', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' }, { loop: true });

            expect(player.loop()).toBe(true);
            expect(mockAudioElement.loop).toBe(true);
        });

        it('should apply startAt option', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' }, { startAt: 30 });

            expect(mockAudioElement.currentTime).toBe(30);
        });

        it('should set error on play failure', async () => {
            mockAudioElement.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));

            await expect(player.play({ src: 'https://example.com/audio.mp3' })).rejects.toThrow('NotAllowedError');
            expect(player.error()).toBe('NotAllowedError');
        });

        it('should load source if provided', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });

            expect(player.sourceUrl()).toBe('https://example.com/audio.mp3');
        });
    });

    describe('pause', () => {
        it('should pause the audio element', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });
            player.pause();

            expect(mockAudioElement.pause).toHaveBeenCalled();
        });

        it('should set isPaused to true', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });
            player.pause();

            expect(player.isPaused()).toBe(true);
        });

        it('should be a no-op when audio element is not initialized', () => {
            // Reset to get a fresh player without ensureElement called
            TestBed.resetTestingModule();
            TestBed.configureTestingModule({
                providers: [provideZonelessChangeDetection(), AudioPlayer]
            });
            const freshPlayer = TestBed.inject(AudioPlayer);
            freshPlayer.pause();

            expect(freshPlayer.isPlaying()).toBe(false);
        });
    });

    describe('stop', () => {
        it('should pause and reset currentTime', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });
            player.stop();

            expect(mockAudioElement.pause).toHaveBeenCalled();
            expect(mockAudioElement.currentTime).toBe(0);
        });

        it('should set isPlaying and isPaused to false', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });
            player.stop();

            expect(player.isPlaying()).toBe(false);
            expect(player.isPaused()).toBe(false);
        });

        it('should be a no-op when audio element is not initialized', () => {
            TestBed.resetTestingModule();
            TestBed.configureTestingModule({
                providers: [provideZonelessChangeDetection(), AudioPlayer]
            });
            const freshPlayer = TestBed.inject(AudioPlayer);
            freshPlayer.stop();

            expect(freshPlayer.isPlaying()).toBe(false);
        });
    });

    describe('setVolume', () => {
        it('should update volume signal', () => {
            player.setVolume(0.7);

            expect(player.volume()).toBe(0.7);
        });

        it('should clamp volume to 0', () => {
            player.setVolume(-1);

            expect(player.volume()).toBe(0);
        });

        it('should clamp volume to 1', () => {
            player.setVolume(5);

            expect(player.volume()).toBe(1);
        });

        it('should update audio element volume when initialized', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });
            player.setVolume(0.3);

            expect(mockAudioElement.volume).toBe(0.3);
        });
    });

    describe('setLoop', () => {
        it('should update loop signal', () => {
            player.setLoop(true);

            expect(player.loop()).toBe(true);
        });

        it('should update audio element loop when initialized', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });
            player.setLoop(true);

            expect(mockAudioElement.loop).toBe(true);
        });
    });

    describe('live media streams', () => {
        it('attaches a live stream without creating an object URL', () => {
            // arrange
            const mediaStream = createMockMediaStream();

            // act
            player.load({ src: mediaStream.stream });

            // assert
            expect(mockAudioElement.srcObject).toBe(mediaStream.stream);
            expect(player.sourceStream()).toBe(mediaStream.stream);
            expect(player.sourceUrl()).toBeNull();
            expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
            expect(mockAudioElement.load).not.toHaveBeenCalled();
        });

        it('plays and mutes a live stream through the shared audio element', async () => {
            // arrange
            const mediaStream = createMockMediaStream();

            // act
            await player.play({ src: mediaStream.stream }, { startAt: 30 });
            player.setMuted(true);

            // assert
            expect(mockAudioElement.play).toHaveBeenCalledOnce();
            expect(mockAudioElement.currentTime).toBe(0);
            expect(mockAudioElement.muted).toBe(true);
            expect(player.isMuted()).toBe(true);
        });

        it('does not seek or stop externally owned tracks when live playback ends', async () => {
            // arrange
            const mediaStream = createMockMediaStream();
            await player.play({ src: mediaStream.stream });
            mockAudioElement.currentTime = 42;

            // act
            player.stop();
            player.dispose();

            // assert
            expect(mockAudioElement.currentTime).toBe(42);
            expect(mockAudioElement.srcObject).toBeNull();
            expect(mediaStream.stopTrack).not.toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should clean up resources', async () => {
            const blob = new Blob(['data'], { type: 'audio/webm' });
            await player.play({ src: blob });
            player.dispose();

            expect(player.isPlaying()).toBe(false);
            expect(player.sourceUrl()).toBeNull();
            expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();
        });

        it('should pause audio before disposing', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });
            player.dispose();

            expect(mockAudioElement.pause).toHaveBeenCalled();
        });
    });

    describe('event handlers', () => {
        it('should update duration on loadedmetadata', () => {
            player.load({ src: 'https://example.com/audio.mp3' });

            mockAudioElement.duration = 120;
            const metadataHandlers = mockAudioElement.listeners['loadedmetadata'];
            if (metadataHandlers) {
                for (const fn of metadataHandlers) fn();
            }

            expect(player.duration()).toBe(120);
        });

        it('should update currentTime on timeupdate', () => {
            player.load({ src: 'https://example.com/audio.mp3' });

            mockAudioElement.currentTime = 45;
            const timeupdateHandlers = mockAudioElement.listeners['timeupdate'];
            if (timeupdateHandlers) {
                for (const fn of timeupdateHandlers) fn();
            }

            expect(player.currentTime()).toBe(45);
        });

        it('should handle ended event', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });

            const endedHandlers = mockAudioElement.listeners['ended'];
            if (endedHandlers) {
                for (const fn of endedHandlers) fn();
            }

            expect(player.isPlaying()).toBe(false);
            expect(player.isPaused()).toBe(false);
        });

        it('should handle error event', () => {
            player.load({ src: 'https://example.com/audio.mp3' });

            mockAudioElement.error = { code: 4, message: '' } as MediaError;
            const errorHandlers = mockAudioElement.listeners['error'];
            if (errorHandlers) {
                for (const fn of errorHandlers) fn();
            }

            expect(player.error()).toBe('MediaError(4)');
        });
    });

    describe('destroy', () => {
        it('should dispose on destroy', async () => {
            await player.play({ src: 'https://example.com/audio.mp3' });

            TestBed.resetTestingModule();

            expect(player.isPlaying()).toBe(false);
            expect(player.sourceUrl()).toBeNull();
        });
    });
});
