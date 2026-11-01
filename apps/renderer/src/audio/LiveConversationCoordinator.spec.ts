// #region Imports

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AudioRecorder, PcmAudioCapture, type IPcmAudioFrame } from '@resonanz/audio';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_HOST } from './AUDIO_HOST';
import { AudioBrowserRuntime } from './AudioBrowserRuntime';
import { AudioCaptureLease } from './AudioCaptureLease';
import type { AudioHostEvent } from './AudioHostEvent';
import type { IAudioHost } from './IAudioHost';
import { LiveConversationCoordinator } from './LiveConversationCoordinator';
import type { ICapturePauseEvent } from './ICapturePauseEvent';

// #endregion

const media = vi.hoisted(() => ({
  timeMs: 1_000,
  instances: [] as Array<{
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    setAssistantElement: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('./ConversationAudioRecorder', () => ({
  ConversationAudioRecorder: vi.fn(function () {
    const mixer = {
      get durationMs(): number {
        return media.timeMs;
      },
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      resume: vi.fn(),
      setMicrophoneStream: vi.fn(),
      setAssistantElement: vi.fn(),
      setAssistantAudible: vi.fn(),
      readAssistantLevel: () => 0.2,
    };
    media.instances.push(mixer);
    return mixer;
  }),
}));

class FakeAudio extends EventTarget {
  public crossOrigin = '';
  public src = '';
  public duration = 2;
  public readonly play = vi.fn(async () => {
    this.dispatchEvent(new Event('playing'));
  });
  public readonly pause = vi.fn();
  public readonly load = vi.fn();
  public readonly setAttribute = vi.fn();
  public readonly removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let active: LiveConversationCoordinator | null = null;

function liveScope(createSession?: IAudioHost['createSession']) {
  const frames = new Subject<IPcmAudioFrame>();
  const recorder = {
    error: signal(null),
    mediaStream: signal({ getAudioTracks: () => [] } as unknown as MediaStream),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(null),
    setMuted: vi.fn(),
  };
  const capture = {
    error: signal(null),
    frameAvailable: frames.asObservable(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const listeners = new Set<(event: AudioHostEvent) => void>();
  const audio = new FakeAudio();
  const host = {
    createSession: createSession ?? vi.fn().mockResolvedValue({ id: 'session' }),
    persistChunk: vi.fn().mockResolvedValue(undefined),
    finishSession: vi.fn().mockResolvedValue(undefined),
    setCaptureStatus: vi.fn().mockResolvedValue(undefined),
    appendTranscript: vi.fn().mockResolvedValue(undefined),
    speechStart: vi.fn().mockResolvedValue({ started: true }),
    speechStop: vi.fn().mockResolvedValue({ stopped: true }),
    speechListen: vi.fn(async (input: { sessionId: string; enabled: boolean }) => ({
      listening: input.enabled,
    })),
    speechSynthesize: vi.fn(
      async (input: { sessionId: string; speechId: string; text: string; voice?: string }) => ({
        audioUrl: `resonanz-voice://session/${input.sessionId}/${input.speechId}`,
      }),
    ),
    speechCancel: vi.fn().mockResolvedValue({ cancelled: true }),
    respond: vi.fn().mockResolvedValue(undefined),
    cancelResponse: vi.fn().mockResolvedValue({ ok: true }),
    onEvent: vi.fn((listener: (event: AudioHostEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  } satisfies IAudioHost;
  const runtime = {
    recordingMimeType: () => 'audio/webm',
    now: () => media.timeMs,
    createAudioElement: vi.fn(() => audio as unknown as HTMLAudioElement),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      LiveConversationCoordinator,
      AudioCaptureLease,
      { provide: AUDIO_HOST, useValue: host },
      { provide: AudioRecorder, useValue: recorder },
      { provide: PcmAudioCapture, useValue: capture },
      { provide: AudioBrowserRuntime, useValue: runtime },
    ],
  });
  active = TestBed.inject(LiveConversationCoordinator);
  const emit = (event: AudioHostEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };
  const speech = (text: string, final: boolean, id = 'utterance'): void => {
    emit({
      type: 'speech.result',
      sessionId: 'session',
      id,
      text,
      final,
      startMs: 0,
      endMs: media.timeMs,
    });
  };
  const respondId = (): string => host.respond.mock.calls.at(-1)?.[0]?.runId ?? '';
  const text = (delta: string, runId = respondId()): void => {
    emit({ type: 'assistant.text', sessionId: 'session', runId, text: delta });
  };
  const complete = (runId = respondId()): void => {
    emit({ type: 'assistant.completed', sessionId: 'session', runId, kind: 'conversation' });
  };
  return {
    coordinator: active,
    host,
    recorder,
    capture,
    runtime,
    audio,
    emit,
    speech,
    text,
    complete,
    respondId,
    frames,
  };
}

beforeEach(() => {
  media.instances.length = 0;
  media.timeMs = 1_000;
});
afterEach(async () => {
  await active?.dispose().catch(() => undefined);
  active = null;
  TestBed.resetTestingModule();
  vi.clearAllMocks();
});

describe('LiveConversationCoordinator', () => {
  it('observes actual mixer pause and resume as separate nonspeech metadata', async () => {
    const scope = liveScope();
    const pauses: ICapturePauseEvent[] = [];
    scope.coordinator.pauseEvents.subscribe((event) => pauses.push(event));
    await scope.coordinator.start();
    media.timeMs = 5000;
    await scope.coordinator.pause();
    media.timeMs = 185000;
    await scope.coordinator.resume();
    expect(pauses).toHaveLength(2);
    expect(pauses[0]?.pause.atMs).toBe(5000);
    expect(pauses[0]?.pause.durationMs).toBeUndefined();
    expect(pauses[1]?.pause).toEqual({ id: pauses[0]?.pause.id, atMs: 5000, durationMs: 180000 });
    expect(scope.host.appendTranscript).not.toHaveBeenCalled();
  });
  it('does not acquire microphone or native speech when a pending session creation is cancelled', async () => {
    const created = deferred<{ id: string }>();
    const scope = liveScope(vi.fn(() => created.promise));
    const starting = scope.coordinator.start();
    await scope.coordinator.stop();
    created.resolve({ id: 'cancelled' });
    await starting;
    expect(scope.recorder.start).not.toHaveBeenCalled();
    expect(scope.host.speechStart).not.toHaveBeenCalled();
    expect(scope.host.finishSession).toHaveBeenCalledWith({
      sessionId: 'cancelled',
      durationMs: 0,
    });
    expect(scope.coordinator.snapshot().state).toBe('idle');
  });

  it('waits for a unique host-persisted final turn rather than responding to cumulative partials', async () => {
    const scope = liveScope();
    await scope.coordinator.start();
    scope.speech('Was', false);
    scope.speech('Was ist offen?', false);
    expect(scope.host.respond).not.toHaveBeenCalled();
    expect(scope.coordinator.snapshot().participantDraft).toBe('Was ist offen?');
    scope.speech('Was ist offen?', true);
    scope.speech('Was ist offen?', true);
    await vi.waitFor(() => expect(scope.host.respond).toHaveBeenCalledOnce());
    expect(scope.host.appendTranscript).not.toHaveBeenCalled();
    expect(scope.recorder.start).toHaveBeenCalledWith(
      expect.objectContaining({
        retention: 'none',
        audioConstraints: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }),
    );
    expect(scope.recorder.start.mock.calls[0]?.[0]).not.toHaveProperty('audioDeviceId');
  });

  it('synthesizes local text deltas sentence by sentence and commits only actually played speech', async () => {
    const scope = liveScope();
    await scope.coordinator.start({ voice: 'native-voice' });
    scope.speech('Begrüße mich', true);
    await vi.waitFor(() => expect(scope.host.respond).toHaveBeenCalledOnce());
    scope.text('Guten ');
    expect(scope.host.speechSynthesize).not.toHaveBeenCalled();
    scope.text('Morgen. ');
    scope.complete();
    await vi.waitFor(() => expect(scope.audio.play).toHaveBeenCalledOnce());
    const synthesized = scope.host.speechSynthesize.mock.calls[0]?.[0];
    expect(synthesized).toMatchObject({
      sessionId: 'session',
      text: 'Guten Morgen.',
      voice: 'native-voice',
    });
    expect(scope.audio.crossOrigin).toBe('anonymous');
    expect(media.instances[0]?.setAssistantElement).toHaveBeenCalledWith(scope.audio);
    expect(scope.host.speechListen.mock.calls.at(-1)?.[0].enabled).toBe(false);
    expect(scope.coordinator.snapshot().stage).toBe('speaking');
    expect(scope.host.appendTranscript).not.toHaveBeenCalled();
    media.timeMs = 2_000;
    scope.audio.dispatchEvent(new Event('ended'));
    media.timeMs = 2_200;
    await vi.waitFor(() => expect(scope.host.appendTranscript).toHaveBeenCalledOnce());
    expect(scope.host.appendTranscript).toHaveBeenCalledWith({
      sessionId: 'session',
      id: synthesized?.speechId,
      speaker: 'assistant',
      text: 'Guten Morgen.',
      startMs: 1_000,
      endMs: 2_000,
      final: true,
    });
    await vi.waitFor(() => expect(scope.coordinator.snapshot().listening).toBe(true));
  });

  it('blocks playback until native recognition has actually acknowledged suspension', async () => {
    const scope = liveScope();
    await scope.coordinator.start();
    scope.speech('Antworte', true);
    await vi.waitFor(() => expect(scope.host.respond).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(scope.coordinator.snapshot().listening).toBe(true));
    const suspended = deferred<{ listening: boolean }>();
    scope.host.speechListen.mockImplementationOnce(() => suspended.promise);
    scope.text('Eine Antwort. ');
    await vi.waitFor(() => expect(scope.host.speechSynthesize).toHaveBeenCalledOnce());
    expect(scope.audio.play).not.toHaveBeenCalled();
    suspended.resolve({ listening: false });
    await vi.waitFor(() => expect(scope.audio.play).toHaveBeenCalledOnce());
  });

  it.each(['success', 'error'] as const)(
    'isolates a late synthesis %s after pause and resume',
    async (outcome) => {
      const scope = liveScope();
      await scope.coordinator.start();
      scope.speech('Erste Frage', true);
      await vi.waitFor(() => expect(scope.host.respond).toHaveBeenCalledOnce());
      const oldRunId = scope.respondId();
      const clip = deferred<{ audioUrl: string }>();
      scope.host.speechSynthesize.mockImplementationOnce(() => clip.promise);
      scope.text('Alte Antwort. ');
      await vi.waitFor(() => expect(scope.host.speechSynthesize).toHaveBeenCalledOnce());
      const oldClip = scope.host.speechSynthesize.mock.calls[0]?.[0];
      await scope.coordinator.pause();
      await scope.coordinator.resume();
      scope.speech('Neue Frage', true, 'utterance-2');
      await vi.waitFor(() => expect(scope.host.respond).toHaveBeenCalledTimes(2));
      if (outcome === 'success')
        clip.resolve({ audioUrl: `resonanz-voice://session/session/${oldClip?.speechId}` });
      else clip.reject(new Error('obsolete synthesis failure'));
      scope.text('Veralteter Text. ', oldRunId);
      scope.complete(oldRunId);
      await Promise.resolve();
      await Promise.resolve();
      expect(scope.audio.play).not.toHaveBeenCalled();
      expect(scope.coordinator.snapshot()).toMatchObject({
        state: 'live',
        pendingResponses: 1,
        assistantDraft: '',
        error: null,
      });
      expect(scope.host.cancelResponse).toHaveBeenCalledWith({ runId: oldRunId });
      expect(scope.host.speechStop).toHaveBeenCalledWith({ sessionId: 'session' });
      expect(scope.host.createSession).toHaveBeenCalledOnce();
    },
  );

  it('interrupts audible playback, cancels inference and never commits an unplayed full sentence', async () => {
    const scope = liveScope();
    await scope.coordinator.start();
    scope.speech('Sprich', true);
    await vi.waitFor(() => expect(scope.host.respond).toHaveBeenCalledOnce());
    const runId = scope.respondId();
    scope.text('Eine lange Antwort. ');
    await vi.waitFor(() => expect(scope.audio.play).toHaveBeenCalledOnce());
    media.timeMs = 2_000;
    const interrupted = scope.coordinator.interrupt();
    media.timeMs = 2_200;
    await interrupted;
    scope.audio.dispatchEvent(new Event('ended'));
    scope.complete(runId);
    expect(scope.host.cancelResponse).toHaveBeenCalledWith({ runId });
    expect(scope.host.appendTranscript).not.toHaveBeenCalled();
    expect(scope.coordinator.snapshot()).toMatchObject({
      listening: true,
      pendingResponses: 0,
      stage: 'listening',
    });
    expect(scope.audio.src).toBe('');
  });

  it('mutes native recognition with the microphone and suppresses output without cancelling text inference', async () => {
    const scope = liveScope();
    await scope.coordinator.start();
    await scope.coordinator.setMicrophoneMuted(true);
    expect(scope.recorder.setMuted).toHaveBeenLastCalledWith(true);
    expect(scope.host.speechListen).toHaveBeenLastCalledWith({
      sessionId: 'session',
      enabled: false,
    });
    await scope.coordinator.setMicrophoneMuted(false);
    scope.speech('Antworte leise', true);
    await vi.waitFor(() => expect(scope.host.respond).toHaveBeenCalledOnce());
    await scope.coordinator.setAssistantMuted(true);
    scope.text('Bleibt Text. ');
    scope.complete();
    expect(scope.host.cancelResponse).not.toHaveBeenCalled();
    expect(scope.host.speechSynthesize).not.toHaveBeenCalled();
    expect(scope.coordinator.snapshot().assistantDraft).toBe('Bleibt Text. ');
  });

  it('reports finalization failure after releasing physical and native resources', async () => {
    const scope = liveScope();
    await scope.coordinator.start();
    scope.host.finishSession.mockRejectedValue(new Error('metadata unavailable'));
    await expect(scope.coordinator.stop()).rejects.toThrow('metadata unavailable');
    expect(scope.recorder.stop).toHaveBeenCalledOnce();
    expect(scope.capture.stop).toHaveBeenCalledOnce();
    expect(scope.host.speechStop).toHaveBeenCalledWith({ sessionId: 'session' });
    expect(media.instances[0]?.stop).toHaveBeenCalledOnce();
    expect(scope.coordinator.snapshot()).toMatchObject({
      state: 'error',
      error: 'metadata unavailable',
    });
  });
});
