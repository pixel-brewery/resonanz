// #region Imports
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AudioPlayer, TextToSpeechService } from '@resonanz/audio';
import { CapturePresenter } from '../presenters/CapturePresenter';
import { LibraryStore } from './LibraryStore';
// #endregion

const sessionAudioUrl = /^resonanz-audio:\/\/session\/([^/?#]+)$/u;

/**
 * What the mini player shows: a recording played through the shared audio player or an answer
 * read aloud by the system voice.
 *
 * @public
 */
export interface INowPlaying {
  readonly kind: 'recording' | 'speech';
  readonly sessionId: string | null;
  readonly title: string;
  readonly playing: boolean;
  /** Share of the recording already played, or null when unknown (speech). */
  readonly progress: number | null;
  readonly positionMs: number;
  readonly durationMs: number;
}

/**
 * Projects every playback in the window into one mini player at the bottom of the window and
 * controls it from there. Playback keeps running while the person navigates; starting a capture
 * pauses it so the microphone does not record it.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class PlaybackStore {
  private readonly _player = inject(AudioPlayer);
  private readonly _speech = inject(TextToSpeechService);
  private readonly _router = inject(Router);
  private readonly _library = inject(LibraryStore);
  private readonly _capture = inject(CapturePresenter);
  private readonly _speechSession = signal<{ readonly id: string; readonly title: string } | null>(
    null,
  );

  private readonly _recordingSessionId = computed(
    () => sessionAudioUrl.exec(this._player.sourceUrl() ?? '')?.[1] ?? null,
  );

  /** Current playback, or null when nothing plays or waits paused. */
  public readonly nowPlaying = computed<INowPlaying | null>(() => {
    if (this._speech.isSpeaking()) {
      const session = this._speechSession();
      return {
        kind: 'speech',
        sessionId: session?.id ?? null,
        title: session?.title ?? '',
        playing: !this._speech.isPaused(),
        progress: null,
        positionMs: 0,
        durationMs: 0,
      };
    }
    const sessionId = this._recordingSessionId();
    if (!sessionId || (!this._player.isPlaying() && !this._player.isPaused())) return null;
    const durationMs = this._player.duration() * 1000;
    const positionMs = this._player.currentTime() * 1000;
    return {
      kind: 'recording',
      sessionId,
      title: this._library.sessions().find((session) => session.id === sessionId)?.title ?? '',
      playing: this._player.isPlaying(),
      progress: durationMs > 0 ? Math.min(1, positionMs / durationMs) : null,
      positionMs,
      durationMs,
    };
  });

  public constructor() {
    effect(() => {
      if (!this._capture.active()) return;
      untracked(() => {
        if (this._player.isPlaying()) this._player.pause();
        if (this._speech.isSpeaking() && !this._speech.isPaused()) this._speech.pause();
      });
    });
  }

  /**
   * Names the session whose text the system voice reads next.
   *
   * @param session - Session that owns the read text.
   */
  public announceSpeech(session: { readonly id: string; readonly title: string } | null): void {
    this._speechSession.set(session ? { id: session.id, title: session.title } : null);
  }

  /** Pauses or resumes the current playback. */
  public async toggle(): Promise<void> {
    const current = this.nowPlaying();
    if (!current) return;
    if (current.kind === 'speech') {
      if (current.playing) this._speech.pause();
      else this._speech.resume();
      return;
    }
    if (current.playing) {
      this._player.pause();
      return;
    }
    if (this._capture.active()) return;
    await this._player.play();
  }

  /** Stops the current playback; a recording rewinds, speech is cancelled. */
  public stop(): void {
    const current = this.nowPlaying();
    if (current?.kind === 'speech') this._speech.stop();
    else this._player.stop();
  }

  /** Opens the session that owns the current playback. */
  public async open(): Promise<void> {
    const sessionId = this.nowPlaying()?.sessionId;
    if (sessionId) await this._router.navigate(['/session', sessionId]);
  }
}
