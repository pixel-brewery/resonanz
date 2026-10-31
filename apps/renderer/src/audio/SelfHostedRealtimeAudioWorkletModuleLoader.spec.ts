// #region Imports

import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelfHostedRealtimeAudioWorkletModuleLoader } from './SelfHostedRealtimeAudioWorkletModuleLoader';

// #endregion

afterEach(() => TestBed.resetTestingModule());

describe('SelfHostedRealtimeAudioWorkletModuleLoader', () => {
  it.each([
    [
      'file:///application/renderer/index.html',
      'file:///application/renderer/audio/pcm-audio.worklet.js',
    ],
    [
      'https://resonanz.example/app/index.html',
      'https://resonanz.example/app/audio/pcm-audio.worklet.js',
    ],
  ])('keeps the worklet under the app origin for %s', async (baseURI, expectedUrl) => {
    // Arrange
    TestBed.configureTestingModule({
      providers: [
        SelfHostedRealtimeAudioWorkletModuleLoader,
        { provide: DOCUMENT, useValue: { baseURI } },
      ],
    });
    const addModule = vi.fn().mockResolvedValue(undefined);
    const context = { audioWorklet: { addModule } } as unknown as AudioContext;

    // Act
    await TestBed.inject(SelfHostedRealtimeAudioWorkletModuleLoader).load(context);

    // Assert
    expect(addModule).toHaveBeenCalledExactlyOnceWith(expectedUrl);
  });

  it('propagates an actual asset load failure without switching to a blocked blob module', async () => {
    // Arrange
    TestBed.configureTestingModule({
      providers: [
        SelfHostedRealtimeAudioWorkletModuleLoader,
        { provide: DOCUMENT, useValue: { baseURI: 'file:///application/renderer/index.html' } },
      ],
    });
    const error = new Error('asset missing');
    const addModule = vi.fn().mockRejectedValue(error);
    const context = { audioWorklet: { addModule } } as unknown as AudioContext;

    // Act and assert
    await expect(
      TestBed.inject(SelfHostedRealtimeAudioWorkletModuleLoader).load(context),
    ).rejects.toBe(error);
    expect(addModule).toHaveBeenCalledExactlyOnceWith(
      'file:///application/renderer/audio/pcm-audio.worklet.js',
    );
  });
});
