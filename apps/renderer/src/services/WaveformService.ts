import { Injectable, inject, signal } from '@angular/core';
import type { ISession } from '@resonanz/contracts';
import { DesktopApi } from './DesktopApi';

/** Derives real peaks once from protected local audio, with bounded decoding and concurrency. */
@Injectable({ providedIn: 'root' })
export class WaveformService {
  private readonly _api = inject(DesktopApi);
  private readonly _cache = signal<ReadonlyMap<string, readonly number[]>>(new Map());
  private readonly _pending = new Map<string, Promise<readonly number[]>>();
  private _tail: Promise<unknown> = Promise.resolve();
  public readonly cache = this._cache.asReadonly();
  public load(session: ISession): Promise<readonly number[]> {
    if (session.waveform?.length) {
      this.remember(session.id, session.waveform);
      return Promise.resolve(session.waveform);
    }
    const cached = this._cache().get(session.id);
    if (cached) return Promise.resolve(cached);
    const pending = this._pending.get(session.id);
    if (pending) return pending;
    if (
      !session.audioUrl ||
      !session.audioAvailable ||
      session.audioBytes > 64 * 1024 * 1024 ||
      ['recording', 'paused'].includes(session.status)
    )
      return Promise.resolve([]);
    const promise = this._tail
      .then(() => this.decode(session))
      .catch(() => [] as readonly number[])
      .finally(() => this._pending.delete(session.id));
    this._pending.set(session.id, promise);
    this._tail = promise;
    return promise;
  }
  private remember(id: string, values: readonly number[]): void {
    this._cache.update((cache) => {
      const next = new Map(cache);
      next.set(id, values);
      if (next.size > 100) next.delete(next.keys().next().value!);
      return next;
    });
  }
  private async decode(session: ISession): Promise<readonly number[]> {
    const response = await fetch(session.audioUrl!);
    if (!response.ok) return [];
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 64 * 1024 * 1024) return [];
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(bytes);
      const size = 720;
      const values = Array.from({ length: size }, (_, i) => {
        const start = Math.floor((i * buffer.length) / size);
        const end = Math.floor(((i + 1) * buffer.length) / size);
        let peak = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const samples = buffer.getChannelData(channel);
          for (
            let index = start;
            index < end;
            index += Math.max(1, Math.floor((end - start) / 400))
          )
            peak = Math.max(peak, Math.abs(samples[index] ?? 0));
        }
        return peak;
      });
      const max = Math.max(0.05, ...values);
      const normalized = values.map((v) => Math.min(1, v / max));
      this.remember(session.id, normalized);
      await this._api.request('sessions.waveform', { sessionId: session.id, values: normalized });
      return normalized;
    } finally {
      await context.close();
    }
  }
}
