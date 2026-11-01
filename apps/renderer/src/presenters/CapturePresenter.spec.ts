import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type AppEvent, type ISettings } from '@resonanz/contracts';
import type { IRecordingSnapshot } from '../audio/IRecordingSnapshot';
import type { ILiveConversationSnapshot } from '../audio/ILiveConversationSnapshot';
import { RecordingCoordinator } from '../audio/RecordingCoordinator';
import { LiveConversationCoordinator } from '../audio/LiveConversationCoordinator';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
import { CapturePresenter } from './CapturePresenter';
import { AudioBrowserRuntime } from '../audio/AudioBrowserRuntime';
import type { ICapturePauseEvent } from '../audio/ICapturePauseEvent';
import type { IInputActivityEvent } from '../audio/IInputActivityEvent';

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterEach(() => TestBed.resetTestingModule());
afterAll(() => getTestBed().resetTestEnvironment());

function scope() {
  const sessionId = crypto.randomUUID();
  const recording = signal<IRecordingSnapshot>({
    state: 'recording',
    sessionId,
    durationMs: 500,
    pendingBytes: 0,
    microphoneLevel: 0,
    error: null,
  });
  const live = signal<ILiveConversationSnapshot>({
    state: 'idle',
    stage: 'idle',
    sessionId: null,
    durationMs: 0,
    pendingBytes: 0,
    microphoneLevel: 0,
    assistantLevel: 0,
    microphoneMuted: false,
    assistantMuted: false,
    participantDraft: '',
    assistantDraft: '',
    pendingResponses: 0,
    listening: false,
    error: null,
  });
  const events = new Subject<AppEvent>();
  const pauses = new Subject<ICapturePauseEvent>();
  const livePauses = new Subject<ICapturePauseEvent>();
  const frames = new Subject<IInputActivityEvent>();
  const liveFrames = new Subject<IInputActivityEvent>();
  const settings = signal<ISettings>({
    ...defaultSettings,
    autoTranscribe: false,
    silenceReminder: false,
    markPausesInTranscript: false,
  });
  let now = 0;
  const api = {
    request: vi.fn(async (_method: string, _payload: unknown): Promise<unknown> => ({ ok: true })),
  };
  const recorder = {
    snapshot: recording,
    pauseEvents: pauses.asObservable(),
    inputActivity: frames.asObservable(),
    devices: signal([]),
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => recording.update((value) => ({ ...value, state: 'paused' }))),
    resume: vi.fn(async () => recording.update((value) => ({ ...value, state: 'recording' }))),
    stop: vi.fn(async () => recording.update((value) => ({ ...value, state: 'idle' }))),
  };
  const library = {
    events: events.asObservable(),
    report: vi.fn(),
    refresh: vi.fn(async () => undefined),
    settings,
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      CapturePresenter,
      { provide: DesktopApi, useValue: api },
      { provide: LibraryStore, useValue: library },
      { provide: Router, useValue: { navigate: vi.fn(async () => true) } },
      { provide: RecordingCoordinator, useValue: recorder },
      {
        provide: LiveConversationCoordinator,
        useValue: {
          snapshot: live,
          pauseEvents: livePauses.asObservable(),
          inputActivity: liveFrames.asObservable(),
        },
      },
      { provide: NativeTranscriptionService, useValue: {} },
      { provide: AudioBrowserRuntime, useValue: { now: () => now } },
    ],
  });
  const presenter = TestBed.inject(CapturePresenter);
  TestBed.tick();
  const frame = (atMs: number, rms = 0, conversation = false) => {
    now = atMs;
    (conversation ? liveFrames : frames).next({ sessionId, atMs, rms });
  };
  return {
    presenter,
    recording,
    live,
    sessionId,
    events,
    recorder,
    api,
    settings,
    pauses,
    frame,
    library,
  };
}

describe('CapturePresenter', () => {
  it('journals only opted-in observed pauses and completes an existing note after the preference changes', async () => {
    const { pauses, settings, api, sessionId } = scope();
    const pause = { id: crypto.randomUUID(), atMs: 500 };
    pauses.next({ sessionId, pause });
    expect(api.request).not.toHaveBeenCalled();
    settings.update((value) => ({ ...value, markPausesInTranscript: true }));
    TestBed.tick();
    pauses.next({ sessionId, pause });
    await vi.waitFor(() =>
      expect(api.request).toHaveBeenCalledWith('sessions.pause', { sessionId, pause }),
    );
    settings.update((value) => ({ ...value, markPausesInTranscript: false }));
    TestBed.tick();
    pauses.next({ sessionId, pause: { ...pause, durationMs: 180000 } });
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    expect(api.request).toHaveBeenLastCalledWith('sessions.pause', {
      sessionId,
      pause: { ...pause, durationMs: 180000 },
    });
    pauses.next({ sessionId, pause: { id: crypto.randomUUID(), atMs: 500 } });
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('shows an observed five-minute silence reminder without stopping and continues only the same capture', async () => {
    const { presenter, settings, frame, recorder, api } = scope();
    settings.update((value) => ({ ...value, silenceReminder: true }));
    TestBed.tick();
    for (let atMs = 0; atMs <= 300000; atMs += 1000) frame(atMs);
    expect(presenter.silenceReminder()).not.toBeNull();
    expect(recorder.stop).not.toHaveBeenCalled();
    TestBed.tick();
    await vi.waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        'capture.reminder',
        expect.objectContaining({ visible: true }),
      ),
    );
    presenter.continueAfterSilence();
    TestBed.tick();
    expect(presenter.silenceReminder()).toBeNull();
    expect(recorder.stop).not.toHaveBeenCalled();
    for (let atMs = 301000; atMs <= 599000; atMs += 1000) frame(atMs);
    expect(presenter.silenceReminder()).toBeNull();
    frame(600000);
    expect(presenter.silenceReminder()).not.toBeNull();
  });

  it('does not carry measured quiet time across muted input, spoken assistant output or a changed session', () => {
    const { presenter, settings, recording, live, frame, sessionId } = scope();
    settings.update((value) => ({ ...value, silenceReminder: true }));
    recording.update((value) => ({ ...value, state: 'idle', sessionId: null }));
    live.update((value) => ({ ...value, state: 'live', stage: 'listening', sessionId }));
    TestBed.tick();
    for (let atMs = 0; atMs <= 299000; atMs += 1000) frame(atMs, 0, true);
    live.update((value) => ({ ...value, microphoneMuted: true }));
    TestBed.tick();
    frame(300000, 0, true);
    expect(presenter.silenceReminder()).toBeNull();
    live.update((value) => ({ ...value, microphoneMuted: false, stage: 'speaking' }));
    TestBed.tick();
    for (let atMs = 301000; atMs <= 601000; atMs += 1000) frame(atMs, 0, true);
    expect(presenter.silenceReminder()).toBeNull();
    live.update((value) => ({ ...value, stage: 'listening' }));
    TestBed.tick();
    for (let atMs = 602000; atMs <= 902000; atMs += 1000) frame(atMs, 0, true);
    expect(presenter.silenceReminder()).not.toBeNull();
    live.update((value) => ({ ...value, sessionId: crypto.randomUUID() }));
    TestBed.tick();
    expect(presenter.silenceReminder()).toBeNull();
  });
  it('rejects mini commands for another capture and delegates an owned pause to the existing recorder', async () => {
    const { presenter, events, recorder, sessionId } = scope();
    events.next({ type: 'capture.command', sessionId: crypto.randomUUID(), action: 'pause' });
    events.next({ type: 'capture.command', sessionId: crypto.randomUUID(), action: 'stop' });
    expect(recorder.pause).not.toHaveBeenCalled();
    expect(recorder.stop).not.toHaveBeenCalled();
    events.next({ type: 'capture.command', sessionId, action: 'pause' });
    await vi.waitFor(() => expect(presenter.state()).toBe('paused'));
    expect(recorder.pause).toHaveBeenCalledOnce();
  });

  it('does not expose or undo a late marker acknowledgment after capture ownership changes', async () => {
    const { presenter, recording, api } = scope();
    let acknowledge: (() => void) | undefined;
    api.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = () => resolve({ ok: true });
        }),
    );
    const marking = presenter.markMoment('decision');
    recording.update((value) => ({ ...value, sessionId: crypto.randomUUID() }));
    TestBed.tick();
    acknowledge?.();
    await marking;
    expect(presenter.markerFeedback()).toBeNull();
    await presenter.undoLastMoment();
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('maps the stable system-default select value to the existing recorder default-device contract', async () => {
    const { presenter, recording, recorder } = scope();
    recording.update((value) => ({ ...value, state: 'idle', sessionId: null }));
    TestBed.tick();
    expect(presenter.deviceForm.id().value()).toBe('default');
    await presenter.startRecording();
    expect(recorder.start).toHaveBeenLastCalledWith({ deviceId: null });
    presenter.deviceForm.id().value.set('selected-device');
    await presenter.startRecording();
    expect(recorder.start).toHaveBeenLastCalledWith({ deviceId: 'selected-device' });
  });
});
