// #region Imports
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { LiveConversationCoordinator } from '../audio/LiveConversationCoordinator';
import { RecordingCoordinator } from '../audio/RecordingCoordinator';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { NativeTranscriptionService } from '../services/NativeTranscriptionService';
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
  private readonly _busy = signal(false);
  private _lastRecordingError: string | null = null;
  private _lastLiveError: string | null = null;
  public readonly busy = this._busy.asReadonly();
  public readonly recording = this._recording.snapshot;
  public readonly live = this._live.snapshot;
  public readonly devices = this._recording.devices;
  private readonly _deviceModel = signal({ id: '' });
  public readonly deviceForm = form(this._deviceModel);
  public readonly deviceId = computed(() => this._deviceModel().id || null);
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
  // #endregion

  public constructor() {
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
      if (event.type !== 'ui.command') return;
      if (event.command === 'recording.start') void this.startRecording();
      if (event.command === 'conversation.start') void this.startLive();
      if (event.command === 'recording.stop') void this.stop();
    });
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
          new Error(
            capabilities?.speechMessage ??
              'Native Sprachunterhaltung ist nicht verfügbar. Bitte unter Einstellungen die Spracherkennung und ihre Berechtigungen prüfen.',
          ),
        );
        await this._router.navigate(['/settings']);
        return;
      }
      const assistant = await this._api.request('assistant.status', {});
      if (!assistant.installed || !assistant.authenticated) {
        this._store.report(
          new Error(
            assistant.installed
              ? 'Bitte den lokalen Assistenten unter Einstellungen mit deinem Konto anmelden.'
              : 'Bitte zuerst Codex oder Claude Code installieren und unter Einstellungen verbinden.',
          ),
        );
        await this._router.navigate(['/settings']);
        return;
      }
      try {
        const voice = this._store.settings().voice;
        await this._live.start(voice ? { voice } : {});
      } finally {
        await this.open(this.live().sessionId);
      }
    });
  }

  /** Pauses the active media owner and persists its visible session state. */
  public async pause(): Promise<void> {
    await this.perform(async () => {
      if (this.mode() === 'conversation') await this._live.pause();
      else await this._recording.pause();
    });
  }

  /** Resumes the current recording or native speech session. */
  public async resume(): Promise<void> {
    await this.perform(async () => {
      if (this.mode() === 'conversation') await this._live.resume();
      else await this._recording.resume();
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
  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this._busy.set(true);
    this._store.clearError();
    try {
      await action();
    } catch (error) {
      this._store.report(error);
    } finally {
      this._busy.set(false);
    }
  }
}
