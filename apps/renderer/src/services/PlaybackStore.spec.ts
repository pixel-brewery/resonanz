// @vitest-environment jsdom
// #region Imports
import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { AudioPlayer, TextToSpeechService } from '@resonanz/audio';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CapturePresenter } from '../presenters/CapturePresenter';
import { LibraryStore } from './LibraryStore';
import { PlaybackStore } from './PlaybackStore';
// #endregion

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterEach(() => TestBed.resetTestingModule());
afterAll(() => getTestBed().resetTestEnvironment());

function setup() {
  const isPlaying = signal(false);
  const isPaused = signal(false);
  const sourceUrl = signal<string | null>(null);
  const player = {
    isPlaying,
    isPaused,
    sourceUrl,
    currentTime: signal(30),
    duration: signal(120),
    play: vi.fn(async () => {
      isPlaying.set(true);
      isPaused.set(false);
    }),
    pause: vi.fn(() => {
      isPlaying.set(false);
      isPaused.set(true);
    }),
    stop: vi.fn(() => {
      isPlaying.set(false);
      isPaused.set(false);
    }),
  };
  const isSpeaking = signal(false);
  const speechPaused = signal(false);
  const speech = {
    isSpeaking,
    isPaused: speechPaused,
    pause: vi.fn(() => speechPaused.set(true)),
    resume: vi.fn(() => speechPaused.set(false)),
    stop: vi.fn(() => isSpeaking.set(false)),
  };
  const active = signal(false);
  const router = { navigate: vi.fn(async () => true) };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AudioPlayer, useValue: player },
      { provide: TextToSpeechService, useValue: speech },
      { provide: Router, useValue: router },
      { provide: CapturePresenter, useValue: { active } },
      {
        provide: LibraryStore,
        useValue: { sessions: signal([{ id: 'release', title: 'Release 2.0' }]) },
      },
    ],
  });
  const store = TestBed.inject(PlaybackStore);
  TestBed.tick();
  return { store, player, speech, active, router, sourceUrl, isPlaying, isSpeaking };
}

describe('PlaybackStore', () => {
  it('shows a playing session recording with its position', () => {
    const { store, sourceUrl, isPlaying } = setup();
    expect(store.nowPlaying()).toBeNull();

    sourceUrl.set('resonanz-audio://session/release');
    isPlaying.set(true);

    expect(store.nowPlaying()).toEqual({
      kind: 'recording',
      sessionId: 'release',
      title: 'Release 2.0',
      playing: true,
      progress: 0.25,
      positionMs: 30_000,
      durationMs: 120_000,
    });
  });

  it('pauses, resumes, stops and opens the recording from the mini player', async () => {
    const { store, player, sourceUrl, isPlaying, router } = setup();
    sourceUrl.set('resonanz-audio://session/release');
    isPlaying.set(true);

    await store.toggle();
    expect(player.pause).toHaveBeenCalled();
    expect(store.nowPlaying()?.playing).toBe(false);

    await store.toggle();
    expect(player.play).toHaveBeenCalledWith();

    await store.open();
    expect(router.navigate).toHaveBeenCalledWith(['/session', 'release']);

    store.stop();
    expect(player.stop).toHaveBeenCalled();
    expect(store.nowPlaying()).toBeNull();
  });

  it('prefers text read aloud and controls the system voice', async () => {
    const { store, speech, isSpeaking } = setup();
    store.announceSpeech({ id: 'release', title: 'Release 2.0' });
    isSpeaking.set(true);

    expect(store.nowPlaying()).toMatchObject({
      kind: 'speech',
      title: 'Release 2.0',
      playing: true,
    });
    await store.toggle();
    expect(speech.pause).toHaveBeenCalled();
    await store.toggle();
    expect(speech.resume).toHaveBeenCalled();
    store.stop();
    expect(speech.stop).toHaveBeenCalled();
  });

  it('pauses playback when a capture starts', () => {
    const { player, sourceUrl, isPlaying, active } = setup();
    sourceUrl.set('resonanz-audio://session/release');
    isPlaying.set(true);

    active.set(true);
    TestBed.tick();

    expect(player.pause).toHaveBeenCalled();
  });
});
