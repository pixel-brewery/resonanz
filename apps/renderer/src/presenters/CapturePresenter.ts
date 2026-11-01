// #region Imports
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { LiveConversationCoordinator } from '../audio/LiveConversationCoordinator';
import { RecordingCoordinator } from '../audio/RecordingCoordinator';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
import type { IMiniRecorderSnapshot, ISessionMoment } from '@resonanz/contracts';
import { merge } from 'rxjs';
import { AudioBrowserRuntime } from '../audio/AudioBrowserRuntime';
import type { ICapturePauseEvent } from '../audio/ICapturePauseEvent';
import { SilenceReminderDetector } from './SilenceReminderDetector';
// #endregion

/** Connects real media lifecycles to navigation and user-initiated application actions. */
@Injectable({ providedIn: 'root' })
export class CapturePresenter {
  // #region Fields
  private readonly _api = inject(DesktopApi);
  private readonly _store = inject(LibraryStore);
  private readonly _router = inject(Router);
  private readonly _recording = inject(RecordingCoordinator);
  private readonly _live = inject(LiveConversationCoordinator);
  private readonly _transcription = inject(NativeTranscriptionService);
  private readonly _runtime = inject(AudioBrowserRuntime);
  private readonly _silence = new SilenceReminderDetector();
  private readonly _silenceReminder = signal<{
    readonly sessionId: string;
    readonly reminderId: string;
  } | null>(null);
  private readonly _notedPauses = new Map<string, string>();
  private _pauseWrites: Promise<void> = Promise.resolve();
  private _nativeReminder: { readonly sessionId: string; readonly reminderId: string } | null =
    null;
  private _noticeWrites: Promise<void> = Promise.resolve();
  public readonly silenceReminder = this._silenceReminder.asReadonly();
  private readonly _busy = signal(false);
  private _lastRecordingError: string | null = null;
  private _lastLiveError: string | null = null;
  private readonly _markerFeedback = signal<IMiniRecorderSnapshot['feedback']>(null);
  private _markerTimer: ReturnType<typeof setTimeout> | undefined;
  private _undoMarker: { sessionId: string; momentId: string } | null = null;
  public readonly markerFeedback = this._markerFeedback.asReadonly();
  public readonly busy = this._busy.asReadonly();
  public readonly recording = this._recording.snapshot;
  public readonly live = this._live.snapshot;
  public readonly devices = computed(() =>
    this._recording.devices().filter((device) => device.deviceId !== 'default'),
  );
  private readonly _deviceModel = signal({ id: 'default' });
  public readonly deviceForm = form(this._deviceModel);
  public readonly deviceId = computed(() =>
    this._deviceModel().id === 'default' ? null : this._deviceModel().id || null,
  );
  public readonly mode = computed<'recording' | 'conversation' | null>(() => {
    const inactive = ['idle', 'error', 'disposed'];
    if (!inactive.includes(this.live().state)) return 'conversation';
    if (!inactive.includes(this.recording().state)) return 'recording';
    return null;
  });
  public readonly active = computed(() => this.mode() !== null);
  public readonly sessionId = computed(() =>
    this.mode() === 'conversation' ? this.live().sessionId : this.recording().sessionId,
  );
  public readonly state = computed(() =>
    this.mode() === 'conversation' ? this.live().state : this.recording().state,
  );
  public readonly durationMs = computed(() =>
    this.mode() === 'conversation' ? this.live().durationMs : this.recording().durationMs,
  );
  private readonly _silenceEligible = computed(
    () =>
      Boolean(this._store.settings().silenceReminder) &&
      !this.busy() &&
      (this.mode() === 'recording'
        ? this.state() === 'recording'
        : this.mode() === 'conversation' &&
          this.state() === 'live' &&
          !this.live().microphoneMuted &&
          this.live().stage !== 'speaking'),
  );
  // #endregion

  public constructor() {
    merge(this._recording.pauseEvents, this._live.pauseEvents)
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.pauseObserved(event));
    merge(this._recording.inputActivity, this._live.inputActivity)
      .pipe(takeUntilDestroyed())
      .subscribe((frame) => {
        if (frame.sessionId !== this.sessionId()) return;
        if (
          this._silence.observe({ ...frame, eligible: this._silenceEligible() }) &&
          !this.silenceReminder()
        )
          this._silenceReminder.set({
            sessionId: frame.sessionId,
            reminderId: crypto.randomUUID(),
          });
      });
    effect(() => {
      const sessionId = this.sessionId();
      const reminder = this.silenceReminder();
      if (!this._silenceEligible() || (reminder && reminder.sessionId !== sessionId)) {
        this._silence.reset();
        this._silenceReminder.set(null);
      }
    });
    effect(() => {
      const next = this.silenceReminder();
      if (next?.reminderId === this._nativeReminder?.reminderId) return;
      const previous = this._nativeReminder;
      this._nativeReminder = next;
      for (const notice of [
        ...(previous ? [{ ...previous, visible: false }] : []),
        ...(next ? [{ ...next, visible: true }] : []),
      ]) {
        this._noticeWrites = this._noticeWrites.then(async () => {
          try {
            await this._api.request('capture.reminder', notice);
          } catch (error) {
            if (this.silenceReminder()?.reminderId === notice.reminderId) this._store.report(error);
          }
        });
      }
    });
    effect(() => {
      const recordingError = this.recording().error;
      const liveError = this.live().error;
      if (recordingError && recordingError !== this._lastRecordingError)
        this._store.report(new Error(recordingError));
      if (liveError && liveError !== this._lastLiveError) this._store.report(new Error(liveError));
      this._lastRecordingError = recordingError;
      this._lastLiveError = liveError;
    });
    this._store.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'capture.reminder.failed') {
        if (
          this.silenceReminder()?.sessionId === event.sessionId &&
          event.sessionId === this.sessionId()
        )
          this._store.report(new Error(event.message));
        return;
      }
      if (event.type === 'capture.command') {
        if (!this.active() || event.sessionId !== this.sessionId() || this.busy()) return;
        if (event.action === 'mark') void this.markMoment();
        if (event.action === 'undo') void this.undoLastMoment();
        if (event.action === 'continue') this.continueAfterSilence();
        if (event.action === 'stop') void this.stop();
        if (event.action === 'pause') {
          if (this.state() === 'paused') void this.resume();
          else void this.pause();
        }
        return;
      }
      if (event.type !== 'ui.command') return;
      if (event.command === 'recording.start') void this.startRecording();
      if (event.command === 'conversation.start') void this.startLive();
      if (event.command === 'recording.stop') void this.stop();
      if (event.command === 'capture.toggle') {
        if (this.active()) void this.stop();
        else void this.startRecording();
      }
      if (event.command === 'capture.pause' && this.active()) {
        if (this.state() === 'paused') void this.resume();
        else void this.pause();
      }
      if (event.command === 'capture.mark') void this.markMoment();
    });
    effect(() => {
      const sessionId = this.sessionId();
      if (!this.active() || (this._undoMarker && this._undoMarker.sessionId !== sessionId)) {
        this._undoMarker = null;
        this._markerFeedback.set(null);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (this._markerTimer) clearTimeout(this._markerTimer);
    });
  }
  /** Continues the same capture after the explicit silence reminder. */
  public continueAfterSilence(): void {
    const reminder = this.silenceReminder();
    if (!reminder || !this.active() || reminder.sessionId !== this.sessionId() || this.busy())
      return;
    this._silence.acknowledge(reminder.sessionId, this._runtime.now());
    this._silenceReminder.set(null);
  }
  public async markMoment(kind: ISessionMoment['kind'] = 'moment'): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId || !this.active()) return;
    try {
      const moment = {
        id: crypto.randomUUID(),
        kind,
        atMs: this.durationMs(),
        origin: 'capture' as const,
      };
      await this._api.request('sessions.mark', {
        sessionId,
        moment,
      });
      if (!this.active() || this.sessionId() !== sessionId) return;
      this._undoMarker = { sessionId, momentId: moment.id };
      this._markerFeedback.set({ id: moment.id, kind: moment.kind, atMs: moment.atMs });
      if (this._markerTimer) clearTimeout(this._markerTimer);
      this._markerTimer = setTimeout(() => this._markerFeedback.set(null), 5000);
    } catch (error) {
      this._store.report(error);
    }
  }

  /** Undoes only the last marker acknowledged for the currently owned capture. */
  public async undoLastMoment(): Promise<void> {
    const marker = this._undoMarker;
    if (!marker || !this.active() || this.sessionId() !== marker.sessionId || this.busy()) return;
    try {
      await this._api.request('sessions.unmark', marker);
      if (this._undoMarker === marker) {
        this._undoMarker = null;
        this._markerFeedback.set(null);
      }
    } catch (error) {
      this._store.report(error);
    }
  }

  /** Enumerates microphones after a user opens the device configuration. */
  public async loadDevices(): Promise<void> {
    try {
      await this._recording.initializeDevices();
    } catch (error) {
      this._store.report(error);
    }
  }

  /** Starts real microphone capture using the unchanged Flamox recorder. */
  public async startRecording(): Promise<void> {
    if (this.active() || this.busy()) return;
    await this.perform(async () => {
      await this._recording.start({ deviceId: this.deviceId() });
      await this.open(this.recording().sessionId);
    });
  }

  /** Starts native speech with the authenticated local assistant and system microphone. */
  public async startLive(): Promise<void> {
    if (this.active() || this.busy()) return;
    await this.perform(async () => {
      if (!this._store.capabilities()) await this._store.refresh();
      const capabilities = this._store.capabilities();
      if (!capabilities?.nativeConversation) {
        this._store.report(
          new Error(capabilities?.speechMessage ?? 'loc.resonanz.error.nativeConversation'),
        );
        await this._router.navigate(['/settings']);
        return;
      }
      const assistant = await this._api.request('assistant.status', {});
      if (!assistant.installed || !assistant.authenticated) {
        this._store.report(
          new Error(
            assistant.installed
              ? 'loc.resonanz.error.signIn'
              : 'loc.resonanz.error.installAssistant',
          ),
        );
        await this._router.navigate(['/settings']);
        return;
      }
      try {
        const voice = this._store.settings().voice;
        await this._live.start(voice ? { voice } : {});
      } finally {
        const id = this.live().sessionId;
        if (id) {
          await this._api.request('window.show', {});
          await this._router.navigate(['/voice', id]);
        }
      }
    });
  }

  /** Pauses the active media owner and persists its visible session state. */
  public async pause(): Promise<void> {
    await this.perform(async () => {
      if (this.mode() === 'conversation') await this._live.pause();
      else await this._recording.pause();
      await this._pauseWrites;
    });
  }

  /** Resumes the current recording or native speech session. */
  public async resume(): Promise<void> {
    await this.perform(async () => {
      if (this.mode() === 'conversation') await this._live.resume();
      else await this._recording.resume();
      await this._pauseWrites;
    });
  }

  /** Flushes recorded media and starts transcription only when a native engine is available. */
  public async stop(): Promise<void> {
    if (!this.active() || this.busy()) return;
    const kind = this.mode();
    const id = this.sessionId();
    let finished = false;
    await this.perform(async () => {
      if (kind === 'conversation') await this._live.stop();
      else await this._recording.stop();
      await this._pauseWrites;
      await this._store.refresh();
      finished = true;
    });
    if (
      finished &&
      id &&
      kind === 'recording' &&
      this._store.settings().autoTranscribe &&
      this._store
        .sessions()
        .some(
          (session) => session.id === id && session.audioAvailable && session.status === 'ready',
        ) &&
      this._store.capabilities()?.nativeTranscription
    ) {
      try {
        await this._transcription.transcribe(id);
      } catch (error) {
        this._store.report(error);
      }
    }
  }

  /** Immediately interrupts the local assistant turn and its spoken output. */
  public async interrupt(): Promise<void> {
    await this.perform(() => this._live.interrupt());
  }
  /** Toggles microphone input without ending the session. */
  public async muteMicrophone(): Promise<void> {
    await this.perform(() => this._live.setMicrophoneMuted(!this.live().microphoneMuted));
  }
  private async open(id: string | null): Promise<void> {
    if (id) await this._router.navigate(['/session', id]);
  }
  private pauseObserved(event: ICapturePauseEvent): void {
    const key = `${event.sessionId}:${event.pause.id}`;
    if (event.pause.durationMs === undefined) {
      if (
        !this._store.settings().markPausesInTranscript ||
        event.sessionId !== this.sessionId() ||
        !this.active() ||
        this._notedPauses.has(key)
      )
        return;
      if (this._notedPauses.size >= 2) this._notedPauses.clear();
      this._notedPauses.set(key, event.sessionId);
    } else {
      if (!this._notedPauses.has(key)) return;
      this._notedPauses.delete(key);
    }
    this._pauseWrites = this._pauseWrites.then(async () => {
      try {
        await this._api.request('sessions.pause', event);
      } catch (error) {
        this._store.report(error);
      }
    });
  }
  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this._busy.set(true);
    try {
      await action();
    } catch (error) {
      this._store.report(error);
    } finally {
      this._busy.set(false);
    }
  }
}
