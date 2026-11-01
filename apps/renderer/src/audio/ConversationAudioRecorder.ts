// #region Imports

import { AudioBrowserRuntime } from './AudioBrowserRuntime';

// #endregion

/**
 * Archives microphone and native assistant speech as separate stereo channels.
 *
 * The unchanged shared recorder continues to own the microphone lifecycle.
 * This graph never connects microphone audio to the system speakers.
 *
 * @public
 */
export class ConversationAudioRecorder {
  // #region Fields

  private _context: AudioContext | null = null;
  private _destination: MediaStreamAudioDestinationNode | null = null;
  private _merger: ChannelMergerNode | null = null;
  private _microphoneSource: MediaStreamAudioSourceNode | null = null;
  private _remoteSource: MediaElementAudioSourceNode | null = null;
  private _assistantElement: HTMLMediaElement | null = null;
  private _remoteAnalyser: AnalyserNode | null = null;
  private _remoteGain: GainNode | null = null;
  private _remoteSamples = new Float32Array(256);
  private _recorder: MediaRecorder | null = null;
  private _startedAt = 0;
  private _pausedAt: number | null = null;
  private _pausedDurationMs = 0;
  private _finalDurationMs = 0;
  private _stopPromise: Promise<void> | null = null;

  // #endregion

  // #region Ctor

  /**
   * Creates a host-owned archive without retaining encoded audio in memory.
   *
   * @public
   */
  public constructor(
    private readonly _runtime: AudioBrowserRuntime,
    private readonly _onChunk: (blob: Blob, mimeType: string, elapsedMs: number) => void,
    private readonly _onFailure: (error: Error) => void,
  ) {}

  // #endregion

  // #region Properties

  /**
   * Active archive time excluding user-requested pauses.
   *
   * @public
   * @readonly
   */
  public get durationMs(): number {
    if (this._recorder === null) {
      return this._finalDurationMs;
    }

    return Math.max(
      0,
      (this._pausedAt ?? this._runtime.now()) - this._startedAt - this._pausedDurationMs,
    );
  }

  // #endregion

  // #region Methods

  /**
   * Starts stereo capture with microphone on the left and assistant on the right.
   *
   * @public
   */
  public async start(microphone: MediaStream, mimeType: string): Promise<void> {
    if (this._context !== null) {
      throw new Error('loc.resonanz.error.liveRecorderStarted');
    }

    const context = this._runtime.createAudioContext();
    this._context = context;

    try {
      const destination = context.createMediaStreamDestination();
      destination.channelCount = 2;
      const merger = context.createChannelMerger(2);
      merger.connect(destination);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const remoteGain = context.createGain();
      analyser.connect(remoteGain);
      remoteGain.connect(merger, 0, 1);
      this._destination = destination;
      this._merger = merger;
      this._remoteAnalyser = analyser;
      this._remoteGain = remoteGain;
      this.setMicrophoneStream(microphone);
      await context.resume();

      if (this._context !== context) {
        return;
      }

      const recorder = this._runtime.createMediaRecorder(destination.stream, mimeType);
      this._recorder = recorder;
      this._startedAt = this._runtime.now();
      this._pausedDurationMs = 0;
      this._pausedAt = null;
      this._finalDurationMs = 0;
      recorder.ondataavailable = (event): void => {
        if (this._recorder !== recorder) return;
        if (event.data.size > 0) {
          try {
            this._onChunk(
              event.data,
              event.data.type || recorder.mimeType || mimeType,
              this.durationMs,
            );
          } catch (error: unknown) {
            this._onFailure(this.toError(error));
          }
        }
      };
      recorder.onerror = (event): void => {
        const detail = event as Event & { readonly error?: DOMException };
        this._onFailure(detail.error ?? new Error('loc.resonanz.error.liveRecording'));
      };
      recorder.start(1_000);
    } catch (error: unknown) {
      await this.releaseGraph();
      throw error;
    }
  }

  /**
   * Replaces only the graph's microphone source after a live pause.
   *
   * @public
   */
  public setMicrophoneStream(stream: MediaStream): void {
    this._microphoneSource?.disconnect();
    this._microphoneSource = null;

    if (this._context !== null && this._merger !== null) {
      this._microphoneSource = this._context.createMediaStreamSource(stream);
      this._microphoneSource.connect(this._merger, 0, 0);
    }
  }

  /**
   * Routes one native speech element to speakers and the assistant archive channel.
   *
   * @public
   */
  public setAssistantElement(element: HTMLMediaElement): void {
    if (this._assistantElement === element) return;
    if (this._assistantElement !== null) throw new Error('loc.resonanz.error.liveSpeechBound');
    if (this._context === null || this._remoteAnalyser === null || this._remoteGain === null)
      throw new Error('loc.resonanz.error.liveRecorderReady');

    this._assistantElement = element;
    this._remoteSource = this._context.createMediaElementSource(element);
    this._remoteSource.connect(this._remoteAnalyser);
    this._remoteGain.connect(this._context.destination);
  }

  /**
   * Mirrors output interruption in the archive so replay follows audible output.
   *
   * @public
   */
  public setAssistantAudible(audible: boolean): void {
    if (this._remoteGain !== null) {
      this._remoteGain.gain.value = audible ? 1 : 0;
    }
  }

  /**
   * Samples remote media activity without treating transcript gaps as silence.
   *
   * @public
   */
  public readAssistantLevel(): number {
    if (this._remoteAnalyser === null || this._remoteSource === null) {
      return 0;
    }

    this._remoteAnalyser.getFloatTimeDomainData(this._remoteSamples);
    let energy = 0;

    for (const sample of this._remoteSamples) {
      energy += sample ** 2;
    }

    return Math.min(1, Math.sqrt(energy / this._remoteSamples.length) * 5);
  }

  /**
   * Pauses the encoded archive without changing its stream or sequence.
   *
   * @public
   */
  public pause(): void {
    if (this._recorder?.state === 'recording') {
      this._pausedAt = this._runtime.now();
      this._recorder.pause();
    }
  }

  /**
   * Continues the same encoded archive after the microphone has been replaced.
   *
   * @public
   */
  public resume(): void {
    if (this._recorder?.state === 'paused') {
      this._pausedDurationMs += Math.max(
        0,
        this._runtime.now() - (this._pausedAt ?? this._runtime.now()),
      );
      this._pausedAt = null;
      this._recorder.resume();
    }
  }

  /**
   * Receives the final recorder fragment before releasing graph-owned resources.
   *
   * @public
   */
  public async stop(): Promise<void> {
    if (this._stopPromise !== null) {
      return this._stopPromise;
    }

    const recorder = this._recorder;

    if (recorder === null || recorder.state === 'inactive') {
      this._finalDurationMs = this.durationMs;
      this._recorder = null;
      await this.releaseGraph();
      return;
    }

    this._stopPromise = new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(
        () => reject(new Error('loc.resonanz.error.captureFinalize')),
        5_000,
      );
      recorder.onstop = (): void => {
        globalThis.clearTimeout(timeout);
        resolve();
      };

      try {
        recorder.stop();
      } catch (error: unknown) {
        globalThis.clearTimeout(timeout);
        reject(error);
      }
    });

    try {
      await this._stopPromise;
    } finally {
      this._finalDurationMs = this.durationMs;
      this._recorder = null;
      await this.releaseGraph();
      this._stopPromise = null;
    }
  }

  private async releaseGraph(): Promise<void> {
    const context = this._context;
    this._context = null;
    this._microphoneSource?.disconnect();
    this._remoteSource?.disconnect();
    this._remoteAnalyser?.disconnect();
    this._remoteGain?.disconnect();
    this._merger?.disconnect();
    this._destination?.stream.getTracks().forEach((track) => track.stop());
    this._microphoneSource = null;
    this._remoteSource = null;
    this._assistantElement = null;
    this._remoteAnalyser = null;
    this._remoteGain = null;
    this._merger = null;
    this._destination = null;

    if (context !== null && context.state !== 'closed') {
      await context.close();
    }
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  // #endregion
}
