import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { PcmAudioCapture } from '@resonanz/audio';
import type { Subscription } from 'rxjs';
import { AudioCaptureLease } from '../audio/AudioCaptureLease';

/** Explicit microphone probe, with the same exclusive capture lease as recording. */
@Injectable()
export class MicrophonePreview {
  private readonly _capture = inject(PcmAudioCapture);
  private readonly _lease = inject(AudioCaptureLease);
  private readonly _owner = Symbol('onboarding-microphone');
  private _stream: MediaStream | null = null;
  private _subscription: Subscription | null = null;
  private _generation = 0;
  public readonly active = signal(false);
  public readonly busy = signal(false);
  public readonly level = signal(0);
  public readonly tested = signal(false);
  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      void this.stop();
    });
  }
  public async start(deviceId: string | null): Promise<void> {
    if (this.busy() || this.active()) return;
    this._lease.acquire(this._owner);
    const generation = ++this._generation;
    this.busy.set(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      });
      if (generation !== this._generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this._stream = stream;
      this._subscription = this._capture.frameAvailable.subscribe((frame) => {
        const samples = new Int16Array(frame.data);
        let energy = 0;
        for (const sample of samples) energy += (sample / 32768) ** 2;
        this.level.set(Math.min(1, Math.sqrt(energy / Math.max(1, samples.length)) * 5));
      });
      await this._capture.start(stream);
      if (generation === this._generation) {
        this.active.set(true);
        this.tested.set(true);
      }
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      if (generation === this._generation) this.busy.set(false);
    }
  }
  public async stop(): Promise<void> {
    this._generation++;
    this.active.set(false);
    this.busy.set(false);
    this._subscription?.unsubscribe();
    this._subscription = null;
    try {
      if (this._lease.owns(this._owner)) await this._capture.stop();
    } finally {
      this._stream?.getTracks().forEach((t) => t.stop());
      this._stream = null;
      this.level.set(0);
      this._lease.release(this._owner);
    }
  }
}
