// #region Imports

import { describe, expect, it, vi } from 'vitest';
import type { AudioBrowserRuntime } from './AudioBrowserRuntime';
import { ConversationAudioRecorder } from './ConversationAudioRecorder';

// #endregion

function conversationMedia() {
  let now = 0;
  let recorderState: RecordingState = 'inactive';
  const microphoneTrack = { stop: vi.fn() };
  const destinationTrack = { stop: vi.fn() };
  const microphone = { getTracks: () => [microphoneTrack] } as unknown as MediaStream;
  const assistant = {} as HTMLAudioElement;
  const microphoneSource = { connect: vi.fn(), disconnect: vi.fn() };
  const remoteSource = { connect: vi.fn(), disconnect: vi.fn() };
  const destination = { channelCount: 2, stream: { getTracks: () => [destinationTrack] } };
  const merger = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const analyser = {
    fftSize: 256,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.fill(0.1)),
  };
  const context = {
    state: 'running',
    destination: {},
    createMediaStreamDestination: vi.fn(() => destination),
    createChannelMerger: vi.fn(() => merger),
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => gain),
    createMediaStreamSource: vi.fn(() => microphoneSource),
    createMediaElementSource: vi.fn(() => remoteSource),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const recorder = {
    get state(): RecordingState {
      return recorderState;
    },
    mimeType: 'audio/webm',
    ondataavailable: null as ((event: BlobEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onstop: null as (() => void) | null,
    start: vi.fn(() => {
      recorderState = 'recording';
    }),
    pause: vi.fn(() => {
      recorderState = 'paused';
    }),
    resume: vi.fn(() => {
      recorderState = 'recording';
    }),
    stop: vi.fn(() => {
      recorderState = 'inactive';
      recorder.ondataavailable?.({ data: { size: 8, type: 'audio/webm' } } as BlobEvent);
      recorder.onstop?.();
    }),
  };
  const runtime = {
    now: () => now,
    createAudioContext: () => context,
    createMediaRecorder: vi.fn(() => recorder),
  } as unknown as AudioBrowserRuntime;
  return {
    runtime,
    context,
    recorder,
    microphone,
    assistant,
    microphoneSource,
    remoteSource,
    merger,
    gain,
    analyser,
    destination,
    microphoneTrack,
    destinationTrack,
    setTime: (value: number) => {
      now = value;
    },
  };
}

describe('ConversationAudioRecorder', () => {
  it('archives both speakers on independent stereo channels and releases only its own media resources', async () => {
    // Arrange
    const media = conversationMedia();
    const onChunk = vi.fn();
    const recorder = new ConversationAudioRecorder(media.runtime, onChunk, vi.fn());

    // Act
    await recorder.start(media.microphone, 'audio/webm');
    recorder.setAssistantElement(media.assistant);
    media.setTime(1_000);
    await recorder.stop();

    // Assert
    expect(media.microphoneSource.connect).toHaveBeenCalledWith(media.merger, 0, 0);
    expect(media.remoteSource.connect).toHaveBeenCalledWith(media.analyser);
    expect(media.gain.connect).toHaveBeenCalledWith(media.merger, 0, 1);
    expect(media.gain.connect).toHaveBeenCalledWith(media.context.destination);
    expect(media.microphoneSource.connect).not.toHaveBeenCalledWith(media.context.destination);
    expect(media.merger.connect).toHaveBeenCalledWith(media.destination);
    expect(onChunk).toHaveBeenCalledWith(expect.objectContaining({ size: 8 }), 'audio/webm', 1_000);
    expect(media.destinationTrack.stop).toHaveBeenCalledOnce();
    expect(media.context.close).toHaveBeenCalledOnce();
    expect(media.microphoneTrack.stop).not.toHaveBeenCalled();
  });

  it('reuses one media element source across clips and applies output mute to speakers and archive together', async () => {
    const media = conversationMedia();
    const recorder = new ConversationAudioRecorder(media.runtime, vi.fn(), vi.fn());
    await recorder.start(media.microphone, 'audio/webm');
    recorder.setAssistantElement(media.assistant);
    recorder.setAssistantElement(media.assistant);
    expect(media.context.createMediaElementSource).toHaveBeenCalledOnce();
    expect(recorder.readAssistantLevel()).toBeCloseTo(0.5);
    recorder.setAssistantAudible(false);
    expect(media.gain.gain.value).toBe(0);
    expect(() => recorder.setAssistantElement({} as HTMLAudioElement)).toThrow(
      'loc.resonanz.error.liveSpeechBound',
    );
    await recorder.stop();
    expect(media.remoteSource.disconnect).toHaveBeenCalledOnce();
  });

  it('excludes paused time while continuing the same encoded archive', async () => {
    // Arrange
    const media = conversationMedia();
    const recorder = new ConversationAudioRecorder(media.runtime, vi.fn(), vi.fn());
    await recorder.start(media.microphone, 'audio/webm');

    // Act
    media.setTime(1_000);
    recorder.pause();
    media.setTime(10_000);
    expect(recorder.durationMs).toBe(1_000);
    recorder.resume();
    media.setTime(11_000);
    await recorder.stop();

    // Assert
    expect(recorder.durationMs).toBe(2_000);
    expect(media.recorder.start).toHaveBeenCalledOnce();
    expect(media.recorder.pause).toHaveBeenCalledOnce();
    expect(media.recorder.resume).toHaveBeenCalledOnce();
  });

  it('cleans up a partially built media graph when the browser encoder cannot start', async () => {
    // Arrange
    const media = conversationMedia();
    media.recorder.start.mockImplementation(() => {
      throw new Error('encoder unavailable');
    });
    const recorder = new ConversationAudioRecorder(media.runtime, vi.fn(), vi.fn());

    // Act and assert
    await expect(recorder.start(media.microphone, 'audio/webm')).rejects.toThrow(
      'encoder unavailable',
    );
    expect(media.context.close).toHaveBeenCalledOnce();
    expect(media.destinationTrack.stop).toHaveBeenCalledOnce();
    expect(media.microphoneTrack.stop).not.toHaveBeenCalled();
  });
});
