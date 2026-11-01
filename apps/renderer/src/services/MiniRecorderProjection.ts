import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { type IMiniRecorderSnapshot } from '@resonanz/contracts';
import { uiLanguage } from '@resonanz/intl';
import { CapturePresenter } from '../presenters/CapturePresenter';
import { DesktopApi } from './DesktopApi';
import { LibraryStore } from './LibraryStore';

/** Sends a bounded, coalesced projection of the existing capture owner to Main. */
@Injectable({ providedIn: 'root' })
export class MiniRecorderProjection {
  private readonly _capture = inject(CapturePresenter);
  private readonly _library = inject(LibraryStore);
  private readonly _api = inject(DesktopApi);
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _pending: IMiniRecorderSnapshot | undefined;
  private _sending = false;
  private _disposed = false;
  private _reportedFailure = false;

  public constructor() {
    effect(() => {
      const capture = this._capture;
      const settings = this._library.settings();
      const sessionId = capture.active() ? capture.sessionId() : null;
      const level =
        capture.mode() === 'conversation'
          ? capture.live().microphoneLevel
          : capture.recording().microphoneLevel;
      this._pending = {
        active: sessionId !== null,
        sessionId,
        visible: settings.showMiniRecorder ?? false,
        durationMs: Math.min(86_400_000, Math.max(0, capture.durationMs())),
        level: Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0)),
        paused: capture.state() === 'paused',
        busy: capture.busy(),
        language: uiLanguage(settings.uiLanguage),
        appearance: settings.appearance ?? 'system',
        feedback: capture.markerFeedback(),
      };
      this.schedule();
    });
    inject(DestroyRef).onDestroy(() => {
      this._disposed = true;
      if (this._timer) clearTimeout(this._timer);
      this._pending = undefined;
    });
  }

  private schedule(): void {
    if (this._disposed || this._timer || this._sending) return;
    this._timer = setTimeout(() => {
      this._timer = undefined;
      void this.flush();
    }, 100);
  }

  private async flush(): Promise<void> {
    const snapshot = this._pending;
    if (!snapshot || this._disposed) return;
    this._pending = undefined;
    this._sending = true;
    try {
      await this._api.request('mini.update', snapshot);
      this._reportedFailure = false;
    } catch (error) {
      if (!this._reportedFailure && !this._disposed) this._library.report(error);
      this._reportedFailure = true;
    } finally {
      this._sending = false;
      if (this._pending) this.schedule();
    }
  }
}
