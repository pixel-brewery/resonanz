// #region Imports

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AudioInputDeviceService,
  AudioRecorder,
  PcmAudioCapture,
  type IAudioRecorderChunk,
} from '@resonanz/audio';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_HOST } from './AUDIO_HOST';
import { AudioBrowserRuntime } from './AudioBrowserRuntime';
import { AudioCaptureLease } from './AudioCaptureLease';
import type { IAudioHost } from './IAudioHost';
import { RecordingCoordinator } from './RecordingCoordinator';

// #endregion

function recordingScope(createSession?: IAudioHost['createSession']) {
  const chunks = new Subject<IAudioRecorderChunk>();
  const durationMs = signal(0);
  const recorder = {
    chunkAvailable: chunks.asObservable(),
    durationMs,
    error: signal(null),
    mediaStream: signal({ getAudioTracks: () => [] } as unknown as MediaStream),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(null),
    pause: vi.fn(),
    resume: vi.fn(),
    setMuted: vi.fn(),
  };
  const capture = {
    frameAvailable: new Subject().asObservable(),
    error: signal(null),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  };
  const host = {
    createSession: createSession ?? vi.fn().mockResolvedValue({ id: 'session' }),
    persistChunk: vi.fn().mockResolvedValue(undefined),
    finishSession: vi.fn().mockResolvedValue(undefined),
    setCaptureStatus: vi.fn().mockResolvedValue(undefined),
    appendTranscript: vi.fn().mockResolvedValue(undefined),
    speechStart: vi.fn(),
    speechStop: vi.fn(),
    speechListen: vi.fn(),
    speechSynthesize: vi.fn(),
    speechCancel: vi.fn(),
    respond: vi.fn(),
    cancelResponse: vi.fn(),
    onEvent: vi.fn(() => () => undefined),
  } satisfies IAudioHost;
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      RecordingCoordinator,
      AudioCaptureLease,
      { provide: AUDIO_HOST, useValue: host },
      { provide: AudioRecorder, useValue: recorder },
      { provide: PcmAudioCapture, useValue: capture },
      { provide: AudioInputDeviceService, useValue: { devices: signal([]), initialize: vi.fn() } },
      { provide: AudioBrowserRuntime, useValue: { recordingMimeType: () => 'audio/webm' } },
    ],
  });
  return {
    coordinator: TestBed.inject(RecordingCoordinator),
    host,
    recorder,
    capture,
    chunks,
    durationMs,
  };
}

function chunk(sequence: number, elapsedMs: number): IAudioRecorderChunk {
  return {
    sequence,
    elapsedMs,
    mimeType: 'audio/webm',
    timecodeMs: elapsedMs,
    blob: { size: 4, arrayBuffer: async () => new ArrayBuffer(4) } as Blob,
  };
}

afterEach(() => TestBed.resetTestingModule());

describe('RecordingCoordinator', () => {
  it('persists the final stop fragment before declaring the session finished', async () => {
    // Arrange
    const scope = recordingScope();
    await scope.coordinator.start({ deviceId: 'microphone' });
    scope.chunks.next(chunk(0, 1_000));
    scope.recorder.stop.mockImplementation(async () => {
      scope.durationMs.set(1_500);
      scope.chunks.next(chunk(1, 1_500));
      return null;
    });

    // Act
    await scope.coordinator.stop();

    // Assert
    expect(scope.recorder.start).toHaveBeenCalledWith(
      expect.objectContaining({ audioDeviceId: 'microphone', retention: 'none' }),
    );
    expect(scope.host.persistChunk.mock.calls.map(([value]) => value.sequence)).toEqual([1, 2]);
    expect(scope.host.finishSession).toHaveBeenCalledWith({
      sessionId: 'session',
      durationMs: 1_500,
      error: undefined,
    });
    expect(scope.host.finishSession.mock.invocationCallOrder[0]).toBeGreaterThan(
      scope.host.persistChunk.mock.invocationCallOrder[1] ?? 0,
    );
    expect(scope.coordinator.snapshot().state).toBe('idle');
  });

  it('does not start a microphone after the user cancels a pending session creation', async () => {
    // Arrange
    let created: ((session: { id: string }) => void) | undefined;
    const pending = new Promise<{ id: string }>((resolve) => {
      created = resolve;
    });
    const scope = recordingScope(vi.fn(() => pending));
    const starting = scope.coordinator.start();

    // Act
    await scope.coordinator.stop();
    created?.({ id: 'cancelled-session' });
    await starting;

    // Assert
    expect(scope.recorder.start).not.toHaveBeenCalled();
    expect(scope.host.finishSession).toHaveBeenCalledWith({
      sessionId: 'cancelled-session',
      durationMs: 0,
    });
    expect(scope.coordinator.snapshot().state).toBe('idle');
  });

  it('keeps the authoritative session status aligned with pause and resume', async () => {
    // Arrange
    const scope = recordingScope();
    await scope.coordinator.start();

    // Act
    await scope.coordinator.pause();
    expect(scope.coordinator.snapshot().state).toBe('paused');
    await scope.coordinator.resume();

    // Assert
    expect(scope.host.setCaptureStatus.mock.calls.map(([input]) => input.status)).toEqual([
      'paused',
      'recording',
    ]);
    expect(scope.coordinator.snapshot().state).toBe('recording');
    await scope.coordinator.stop();
  });

  it('retains an error for a partial recording and cannot stop another mode after releasing its lease', async () => {
    // Arrange
    const scope = recordingScope();
    scope.host.persistChunk.mockRejectedValue(new Error('disk full'));
    await scope.coordinator.start();
    scope.chunks.next(chunk(0, 1_000));

    // Act
    await scope.coordinator.stop().catch(() => undefined);
    const previousStops = scope.recorder.stop.mock.calls.length;
    TestBed.inject(AudioCaptureLease).acquire(Symbol('another-mode'));
    await scope.coordinator.stop();

    // Assert
    expect(scope.host.finishSession).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'disk full' }),
    );
    expect(scope.coordinator.snapshot().state).toBe('error');
    expect(scope.recorder.stop).toHaveBeenCalledTimes(previousStops);
  });

  it('does not claim success when durable session finalization fails after microphone cleanup', async () => {
    // Arrange
    const scope = recordingScope();
    await scope.coordinator.start();
    scope.host.finishSession.mockRejectedValue(new Error('metadata unavailable'));

    // Act and assert
    await expect(scope.coordinator.stop()).rejects.toThrow('metadata unavailable');
    expect(scope.capture.stop).toHaveBeenCalledOnce();
    expect(scope.recorder.stop).toHaveBeenCalledOnce();
    expect(scope.coordinator.snapshot()).toMatchObject({
      state: 'error',
      error: 'metadata unavailable',
    });
  });
});
