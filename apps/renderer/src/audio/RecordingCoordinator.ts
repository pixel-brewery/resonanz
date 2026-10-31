// #region Imports

import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import {
  AudioInputDeviceService,
  AudioRecorder,
  PcmAudioCapture,
  type IAudioInputDevice,
} from '@resonanz/audio';
import type { Subscription } from 'rxjs';
import { AUDIO_HOST } from './AUDIO_HOST';
import { AudioBrowserRuntime } from './AudioBrowserRuntime';
import { AudioCaptureLease } from './AudioCaptureLease';
import type { IRecordingSnapshot } from './IRecordingSnapshot';
import { OrderedAudioChunkWriter } from './OrderedAudioChunkWriter';

// #endregion

/**
 * Records one microphone session through the unchanged shared audio primitives.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class RecordingCoordinator {
  // #region Fields

  private readonly _host = inject(AUDIO_HOST);
  private readonly _runtime = inject(AudioBrowserRuntime);
  private readonly _lease = inject(AudioCaptureLease);
  private readonly _recorder = inject(AudioRecorder);
  private readonly _capture = inject(PcmAudioCapture);
  private readonly _devices = inject(AudioInputDeviceService);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _owner = Symbol('recording');
  private readonly _state = signal<IRecordingSnapshot['state']>('idle');
  private readonly _sessionId = signal<string | null>(null);
  private readonly _pendingBytes = signal(0);
  private readonly _durationMs = signal(0);
  private readonly _microphoneLevel = signal(0);
  private readonly _error = signal<string | null>(null);
  private readonly _snapshot = computed<IRecordingSnapshot>(() => ({
    state: this._state(),
    sessionId: this._sessionId(),
    durationMs: this._durationMs(),
    pendingBytes: this._pendingBytes(),
    microphoneLevel: this._microphoneLevel(),
    error: this._error(),
  }));
  private _generation = 0;
  private _writer: OrderedAudioChunkWriter | null = null;
  private _chunkSubscription: Subscription | null = null;
  private _frameSubscription: Subscription | null = null;
  private _stopPromise: Promise<void> | null = null;

  // #endregion

  // #region Ctor

  /**
   * Registers cleanup without owning shell state or application persistence.
   *
   * @public
   */
  public constructor() {
    effect(() => {
      const error = this._recorder.error() ?? this._capture.error();
      if (error !== null && ['recording', 'paused'].includes(this._state())) {
        void this.failCapture(error, this._generation);
      }
    });
    this._destroyRef.onDestroy(() => void this.dispose().catch(() => undefined));
  }

  // #endregion

  // #region Properties

  /**
   * Read-only capture state consumed by the application presenter.
   *
   * @public
   * @readonly
   */
  public get snapshot(): Signal<IRecordingSnapshot> {
    return this._snapshot;
  }

  /**
   * Available microphones owned by the shared device service.
   *
   * @public
   * @readonly
   */
  public get devices(): Signal<ReadonlyArray<IAudioInputDevice>> {
    return this._devices.devices;
  }

  // #endregion

  // #region Methods

  /**
   * Loads the actual microphone catalog without beginning a recording.
   *
   * @public
   */
  public async initializeDevices(): Promise<void> {
    await this._devices.initialize();
  }

  /**
   * Acquires one selected microphone and durably streams ordered chunks.
   *
   * @public
   */
  public async start(
    options: { readonly title?: string; readonly deviceId?: string | null } = {},
  ): Promise<void> {
    if (!['idle', 'error'].includes(this._state())) {
      throw new Error('Die Aufnahme kann in diesem Zustand nicht gestartet werden.');
    }

    this._lease.acquire(this._owner);
    const generation = ++this._generation;
    this._state.set('starting');
    this._sessionId.set(null);
    this._error.set(null);
    this._microphoneLevel.set(0);
    this._durationMs.set(0);

    try {
      const mimeType = this._runtime.recordingMimeType();
      const session = await this._host.createSession({
        kind: 'recording',
        title: options.title,
        mimeType,
      });

      if (generation !== this._generation) {
        await this._host.finishSession({ sessionId: session.id, durationMs: 0 });
        return;
      }

      this._sessionId.set(session.id);
      const writer = new OrderedAudioChunkWriter(
        this._host,
        session.id,
        'microphone',
        (error) => void this.failCapture(error, generation),
        (bytes) => this._pendingBytes.set(bytes),
      );
      this._writer = writer;
      this._chunkSubscription = this._recorder.chunkAvailable.subscribe((chunk) => {
        if (generation !== this._generation && this._state() !== 'stopping') {
          return;
        }

        try {
          this._durationMs.set(chunk.elapsedMs);
          writer.enqueue(chunk.blob, chunk.mimeType, chunk.elapsedMs);
        } catch (error: unknown) {
          void this.failCapture(error, generation);
        }
      });
      await this._recorder.start({
        audioDeviceId: options.deviceId,
        preferredMimeTypes: [mimeType],
        chunkIntervalMs: 1_000,
        retention: 'none',
      });

      if (generation !== this._generation) {
        return;
      }

      const mediaStream = this._recorder.mediaStream();

      if (mediaStream === null) {
        throw new Error('Das Mikrofon hat keinen Audiostream bereitgestellt.');
      }

      this._frameSubscription = this._capture.frameAvailable.subscribe((frame) => {
        this._durationMs.set(this._recorder.durationMs());
        const samples = new Int16Array(frame.data);
        let energy = 0;

        for (const sample of samples) {
          energy += (sample / 32_768) ** 2;
        }

        this._microphoneLevel.set(Math.min(1, Math.sqrt(energy / Math.max(1, samples.length)) * 5));
      });
      await this._capture.start(mediaStream, { frameDurationMs: 20 });

      if (generation === this._generation) {
        this._state.set('recording');
      }
    } catch (error: unknown) {
      if (generation !== this._generation) {
        return;
      }

      await this.failCapture(error, generation);
      throw error;
    }
  }

  /**
   * Pauses encoding and level capture while preserving the current session.
   *
   * @public
   */
  public async pause(): Promise<void> {
    if (this._state() !== 'recording') {
      return;
    }

    const generation = this._generation;
    try {
      this._recorder.pause();
      await this._capture.pause();
      if (generation !== this._generation) return;
      const sessionId = this._sessionId();
      if (sessionId !== null) await this._host.setCaptureStatus?.({ sessionId, status: 'paused' });
      if (generation !== this._generation) return;
      this._microphoneLevel.set(0);
      this._state.set('paused');
    } catch (error: unknown) {
      await this.failCapture(error, generation);
      throw error;
    }
  }

  /**
   * Continues the same encoded stream and durable sequence after a pause.
   *
   * @public
   */
  public async resume(): Promise<void> {
    if (this._state() !== 'paused') {
      return;
    }

    const generation = this._generation;
    try {
      const sessionId = this._sessionId();
      if (sessionId !== null)
        await this._host.setCaptureStatus?.({ sessionId, status: 'recording' });
      if (generation !== this._generation) return;
      await this._capture.resume();
      if (generation !== this._generation) return;
      this._recorder.resume();
      this._state.set('recording');
    } catch (error: unknown) {
      await this.failCapture(error, generation);
      throw error;
    }
  }

  /**
   * Waits for the browser's final fragment before finalizing durable storage.
   *
   * @public
   */
  public async stop(): Promise<void> {
    if (this._stopPromise !== null) {
      return this._stopPromise;
    }

    if (['idle', 'disposed'].includes(this._state())) {
      return;
    }

    if (!this._lease.owns(this._owner)) {
      return;
    }

    ++this._generation;
    this._state.set('stopping');
    this._stopPromise = this.finishCapture();

    try {
      await this._stopPromise;
    } catch (error: unknown) {
      this._error.set(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this._stopPromise = null;
      this._lease.release(this._owner);
      if (this._state() !== 'disposed') {
        this._state.set(this._error() === null ? 'idle' : 'error');
      }
    }
  }

  /**
   * Releases task-owned capture and subscriptions when the application closes.
   *
   * @public
   */
  public async dispose(): Promise<void> {
    try {
      await this.stop();
    } finally {
      this._state.set('disposed');
      this._lease.release(this._owner);
    }
  }

  private async finishCapture(): Promise<void> {
    const sessionId = this._sessionId();
    let failure: unknown = null;

    try {
      for (const finalize of [
        () => this._recorder.stop(),
        () => this._capture.stop(),
        () => this._writer?.close(),
      ]) {
        try {
          await finalize();
        } catch (error: unknown) {
          failure ??= error;
          this._error.set(error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      this._chunkSubscription?.unsubscribe();
      this._chunkSubscription = null;
      this._frameSubscription?.unsubscribe();
      this._frameSubscription = null;
      this._writer = null;
      this._microphoneLevel.set(0);
    }

    if (sessionId !== null) {
      this._durationMs.set(this._recorder.durationMs());
      await this._host.finishSession({
        sessionId,
        durationMs: this._durationMs(),
        error: this._error()?.slice(0, 1_000) ?? undefined,
      });
    }

    if (failure !== null) {
      throw failure;
    }
  }

  private async failCapture(error: unknown, generation: number): Promise<void> {
    if (generation !== this._generation || this._state() === 'stopping') {
      return;
    }

    this._error.set(error instanceof Error ? error.message : String(error));
    await this.stop().catch(() => undefined);
  }

  // #endregion
}
