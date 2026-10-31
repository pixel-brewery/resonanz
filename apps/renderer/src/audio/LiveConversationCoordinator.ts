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
import { AudioRecorder, PcmAudioCapture } from '@resonanz/audio';
import type { Subscription } from 'rxjs';
import { AUDIO_HOST } from './AUDIO_HOST';
import { AudioBrowserRuntime } from './AudioBrowserRuntime';
import { AudioCaptureLease } from './AudioCaptureLease';
import type { AudioHostEvent } from './AudioHostEvent';
import { ConversationAudioRecorder } from './ConversationAudioRecorder';
import type { ILiveConversationSnapshot } from './ILiveConversationSnapshot';
import { MicrophoneVoiceGate } from './MicrophoneVoiceGate';
import { OrderedAudioChunkWriter } from './OrderedAudioChunkWriter';
import { SpokenSentenceBuffer } from './SpokenSentenceBuffer';
import { TranscriptCommitQueue } from './TranscriptCommitQueue';

// #endregion

interface IResponseTurn {
  readonly sessionId: string;
  readonly generation: number;
  readonly revision: number;
  readonly runId: string;
  readonly sentences: SpokenSentenceBuffer;
  tail: Promise<void>;
  completed: boolean;
  queuedSentences: number;
  queuedCharacters: number;
}

/**
 * Coordinates system speech, the installed Synapse assistant and audible replay.
 * Native speech owns participant transcript persistence and turn endpointing.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class LiveConversationCoordinator {
  // #region Fields

  private readonly _host = inject(AUDIO_HOST);
  private readonly _runtime = inject(AudioBrowserRuntime);
  private readonly _lease = inject(AudioCaptureLease);
  private readonly _recorder = inject(AudioRecorder);
  private readonly _capture = inject(PcmAudioCapture);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _owner = Symbol('live-conversation');
  private readonly _voiceGate = new MicrophoneVoiceGate();
  private readonly _state = signal<ILiveConversationSnapshot['state']>('idle');
  private readonly _sessionId = signal<string | null>(null);
  private readonly _durationMs = signal(0);
  private readonly _pendingBytes = signal(0);
  private readonly _microphoneLevel = signal(0);
  private readonly _assistantLevel = signal(0);
  private readonly _microphoneMuted = signal(false);
  private readonly _assistantMuted = signal(false);
  private readonly _participantDraft = signal('');
  private readonly _assistantDraft = signal('');
  private readonly _responsePending = signal(false);
  private readonly _queuedSentences = signal(0);
  private readonly _speaking = signal(false);
  private readonly _listening = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _snapshot = computed<ILiveConversationSnapshot>(() => ({
    state: this._state(),
    stage:
      this._state() !== 'live'
        ? 'idle'
        : this._speaking() && !this._assistantMuted()
          ? 'speaking'
          : this._responsePending() || this._queuedSentences() > 0
            ? 'thinking'
            : this._listening()
              ? 'listening'
              : 'idle',
    sessionId: this._sessionId(),
    durationMs: this._durationMs(),
    pendingBytes: this._pendingBytes(),
    microphoneLevel: this._microphoneLevel(),
    assistantLevel: this._assistantLevel(),
    microphoneMuted: this._microphoneMuted(),
    assistantMuted: this._assistantMuted(),
    participantDraft: this._participantDraft(),
    assistantDraft: this._assistantDraft(),
    pendingResponses: this._responsePending() ? 1 : 0,
    listening: this._listening(),
    error: this._error(),
  }));
  private _generation = 0;
  private _turnRevision = 0;
  private _outputRevision = 0;
  private _turn: IResponseTurn | null = null;
  private _turnSerial: Promise<void> = Promise.resolve();
  private _recognitionSerial: Promise<void> = Promise.resolve();
  private _writer: OrderedAudioChunkWriter | null = null;
  private _mixer: ConversationAudioRecorder | null = null;
  private _transcriptQueue: TranscriptCommitQueue | null = null;
  private _audio: HTMLAudioElement | null = null;
  private _frameSubscription: Subscription | null = null;
  private _unsubscribeEvents: (() => void) | null = null;
  private _activityTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private _echoTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private _resolveEcho: (() => void) | null = null;
  private _cancelPlayback: (() => void) | null = null;
  private _playbackActive = false;
  private _stopPromise: Promise<void> | null = null;
  private _pausePromise: Promise<void> | null = null;
  private _options: { readonly mimeType: string; readonly voice?: string } | null = null;
  private readonly _seenFinals = new Set<string>();
  private _pendingFinal = false;
  private _bargeInPending = false;
  private _turnStartedAt = 0;
  private _lastPlaybackEndedAt = Number.NEGATIVE_INFINITY;

  // #endregion

  // #region Ctor

  /** Releases owned resources when the renderer or media fails. @public */
  public constructor() {
    effect(() => {
      const error = this._recorder.error() ?? this._capture.error();
      if (error !== null && ['connecting', 'live'].includes(this._state())) {
        void this.failLive(error, this._sessionId());
      }
    });
    this._destroyRef.onDestroy(() => void this.dispose().catch(() => undefined));
  }

  // #endregion

  // #region Properties

  /** Read-only capture and spoken-turn state. @public @readonly */
  public get snapshot(): Signal<ILiveConversationSnapshot> {
    return this._snapshot;
  }

  // #endregion

  // #region Methods

  /** Starts a keyless conversation with the system default microphone. @public */
  public async start(
    options: { readonly title?: string; readonly voice?: string } = {},
  ): Promise<void> {
    if (!['idle', 'error'].includes(this._state())) {
      throw new Error('Die Live-Unterhaltung kann in diesem Zustand nicht gestartet werden.');
    }
    this._lease.acquire(this._owner);
    const generation = ++this._generation;
    this._state.set('starting');
    this._sessionId.set(null);
    this._error.set(null);
    this._durationMs.set(0);
    this._pendingBytes.set(0);
    this._microphoneLevel.set(0);
    this._assistantLevel.set(0);
    this._participantDraft.set('');
    this._assistantDraft.set('');
    this._microphoneMuted.set(false);
    this._assistantMuted.set(false);
    this._responsePending.set(false);
    this._queuedSentences.set(0);
    this._listening.set(false);
    this._speaking.set(false);
    this._seenFinals.clear();
    this._pendingFinal = false;
    this._bargeInPending = false;
    this._voiceGate.reset();
    this._lastPlaybackEndedAt = Number.NEGATIVE_INFINITY;
    this._turnSerial = Promise.resolve();
    this._recognitionSerial = Promise.resolve();

    try {
      const mimeType = this._runtime.recordingMimeType();
      this._options = { mimeType, voice: options.voice };
      const session = await this._host.createSession({
        kind: 'conversation',
        title: options.title,
        mimeType,
      });
      if (generation !== this._generation) {
        await this._host.finishSession({ sessionId: session.id, durationMs: 0 });
        return;
      }
      this._sessionId.set(session.id);
      this._writer = new OrderedAudioChunkWriter(
        this._host,
        session.id,
        'conversation',
        (error) => void this.failLive(error, session.id),
        (bytes) => this._pendingBytes.set(bytes),
      );
      this._transcriptQueue = new TranscriptCommitQueue(
        this._host,
        (error) => void this.failLive(error, session.id),
      );
      this._audio = this._runtime.createAudioElement();
      this._audio.crossOrigin = 'anonymous';
      this._audio.setAttribute('playsinline', '');
      this.subscribeEvents(generation);
      await this.startMicrophone(generation);
      if (generation !== this._generation) return;
      const stream = this._recorder.mediaStream();
      if (stream === null) throw new Error('Das Mikrofon hat keinen Audiostream bereitgestellt.');
      const writer = this._writer;
      this._mixer = new ConversationAudioRecorder(
        this._runtime,
        (blob, type, elapsedMs) => writer?.enqueue(blob, type, elapsedMs),
        (error) => void this.failLive(error, session.id),
      );
      await this._mixer.start(stream, mimeType);
      if (generation !== this._generation) return;
      this._mixer.setAssistantElement(this._audio);
      this.startActivityTimer();
      this._state.set('connecting');
      await this._host.speechStart({ sessionId: session.id });
      if (generation !== this._generation) return;
      this._state.set('live');
      this._listening.set(!this._pendingFinal && !this._microphoneMuted());
      if (this._microphoneMuted()) await this.setRecognition(false, generation, this._turnRevision);
      if (this._pendingFinal) {
        this._pendingFinal = false;
        await this.beginResponse();
      }
    } catch (error: unknown) {
      if (generation !== this._generation) return;
      await this.failLive(error, this._sessionId());
      throw error;
    }
  }

  /** Persists typed input before asking the same local assistant. @public */
  public async sendText(text: string): Promise<void> {
    const normalized = text.trim();
    if (normalized.length === 0) return;
    if (normalized.length > 4_000) throw new Error('Die Live-Nachricht ist zu lang.');
    const sessionId = this.requireLiveSession();
    const generation = this._generation;
    const elapsedMs = this._mixer?.durationMs ?? this._durationMs();
    this._participantDraft.set(normalized);
    this._transcriptQueue?.enqueue({
      sessionId,
      id: crypto.randomUUID(),
      speaker: 'participant',
      text: normalized,
      startMs: elapsedMs,
      endMs: elapsedMs,
      final: true,
    });
    await this._transcriptQueue?.flush();
    if (generation === this._generation && this._state() === 'live') await this.beginResponse();
  }

  /** Requests a local answer using the session's persisted context. @public */
  public async requestResponse(): Promise<void> {
    this.requireLiveSession();
    await this.beginResponse();
  }

  /** Stops current inference and speech before listening for a new turn. @public */
  public async interrupt(): Promise<void> {
    if (this._state() !== 'live') return;
    const sessionId = this.requireLiveSession();
    const generation = this._generation;
    const revision = ++this._turnRevision;
    const old = this.detachTurn();
    const operation = this._turnSerial
      .catch(() => undefined)
      .then(async () => {
        await this.cancelNativeTurn(sessionId, old);
        if (this.isCurrentRevision(generation, revision))
          await this.setRecognition(true, generation, revision);
      });
    this._turnSerial = operation;
    await operation.catch(async (error: unknown) => {
      if (this.isCurrentRevision(generation, revision)) await this.failLive(error, sessionId);
    });
  }

  /** Mutes both the archived microphone and the native recognizer. @public */
  public async setMicrophoneMuted(muted: boolean): Promise<void> {
    const generation = this._generation;
    this._microphoneMuted.set(muted);
    if (this._lease.owns(this._owner)) this._recorder.setMuted(muted);
    this._voiceGate.reset();
    if (muted) this._listening.set(false);
    if (this._state() === 'live') {
      const sessionId = this._sessionId();
      try {
        await this.setRecognition(!muted, this._generation, this._turnRevision);
      } catch (error: unknown) {
        if (generation === this._generation) await this.failLive(error, sessionId);
        throw error;
      }
    }
  }

  /** Suppresses audible output while leaving the local text response active. @public */
  public async setAssistantMuted(muted: boolean): Promise<void> {
    this._assistantMuted.set(muted);
    this._mixer?.setAssistantAudible(!muted);
    if (!muted || this._state() !== 'live') return;
    const sessionId = this.requireLiveSession();
    const generation = this._generation;
    const revision = this._turnRevision;
    ++this._outputRevision;
    this.stopPlayback();
    try {
      await this._host.speechCancel({ sessionId });
      if (this.isCurrentRevision(generation, revision))
        await this.setRecognition(true, generation, revision);
    } catch (error: unknown) {
      if (this.isCurrentRevision(generation, revision)) await this.failLive(error, sessionId);
      throw error;
    }
  }

  /** Suspends native speech and physical microphone resources. @public */
  public async pause(): Promise<void> {
    if (this._state() !== 'live') return;
    const sessionId = this.requireLiveSession();
    ++this._generation;
    ++this._turnRevision;
    this._state.set('paused');
    const old = this.detachTurn();
    this._listening.set(false);
    this.unsubscribeEvents();
    this.clearEchoTimer();
    this._mixer?.pause();
    this._durationMs.set(this._mixer?.durationMs ?? this._durationMs());
    this._pausePromise = this.suspendCapture(sessionId, old);
    try {
      await this._pausePromise;
    } catch (error: unknown) {
      await this.failLive(error, sessionId);
      throw error;
    } finally {
      this._pausePromise = null;
    }
  }

  /** Restarts native recognition in the same archived conversation. @public */
  public async resume(): Promise<void> {
    if (this._state() !== 'paused') return;
    await this._pausePromise;
    if (this._state() !== 'paused') return;
    const sessionId = this._sessionId();
    if (sessionId === null) return;
    const generation = ++this._generation;
    this._pendingFinal = false;
    this._bargeInPending = false;
    this._state.set('connecting');
    try {
      await this._host.setCaptureStatus?.({ sessionId, status: 'recording' });
      if (generation !== this._generation) return;
      this.subscribeEvents(generation);
      await this.startMicrophone(generation);
      if (generation !== this._generation) return;
      const stream = this._recorder.mediaStream();
      if (stream === null) throw new Error('Das Mikrofon hat keinen Audiostream bereitgestellt.');
      this._mixer?.setMicrophoneStream(stream);
      this._mixer?.resume();
      await this._host.speechStart({ sessionId });
      if (generation !== this._generation) return;
      this._state.set('live');
      this._listening.set(!this._pendingFinal && !this._microphoneMuted());
      if (this._microphoneMuted()) await this.setRecognition(false, generation, this._turnRevision);
      if (this._pendingFinal) {
        this._pendingFinal = false;
        await this.beginResponse();
      }
    } catch (error: unknown) {
      if (generation !== this._generation) return;
      await this.failLive(error, sessionId);
      throw error;
    }
  }

  /** Drains the stereo archive and transcript before finalizing the session. @public */
  public async stop(): Promise<void> {
    if (this._stopPromise !== null) return this._stopPromise;
    if (['idle', 'disposed'].includes(this._state())) return;
    ++this._generation;
    ++this._turnRevision;
    const sessionId = this._sessionId();
    this._state.set('stopping');
    const old = this.detachTurn();
    this._listening.set(false);
    this.unsubscribeEvents();
    this.clearEchoTimer();
    this._mixer?.pause();
    this._stopPromise = this.finishCapture(sessionId, old);
    try {
      await this._stopPromise;
      this._state.set(this._error() === null ? 'idle' : 'error');
    } catch (error: unknown) {
      this._error.set(this.toError(error).message);
      this._state.set('error');
      throw error;
    } finally {
      this._stopPromise = null;
      this._lease.release(this._owner);
    }
  }

  /** Releases the live session when its Angular owner is destroyed. @public */
  public async dispose(): Promise<void> {
    if (this._state() === 'disposed') return;
    try {
      await this.stop();
    } finally {
      this._state.set('disposed');
      this._lease.release(this._owner);
    }
  }

  private subscribeEvents(generation: number): void {
    this.unsubscribeEvents();
    this._unsubscribeEvents = this._host.onEvent((event) => {
      if (generation === this._generation) this.handleHostEvent(event);
    });
  }

  private unsubscribeEvents(): void {
    this._unsubscribeEvents?.();
    this._unsubscribeEvents = null;
  }

  private handleHostEvent(event: AudioHostEvent): void {
    if (event.sessionId !== this._sessionId() || !['connecting', 'live'].includes(this._state()))
      return;
    if (event.type === 'speech.error') {
      void this.failLive(new Error(event.message), event.sessionId);
      return;
    }
    if (event.type === 'speech.result') {
      this._participantDraft.set(event.text);
      if (!event.final || event.text.trim().length === 0 || this._seenFinals.has(event.id)) return;
      this._seenFinals.add(event.id);
      if (this._seenFinals.size > 256)
        this._seenFinals.delete(this._seenFinals.values().next().value!);
      this._listening.set(false);
      if (this._microphoneMuted()) return;
      if (this._state() === 'connecting') this._pendingFinal = true;
      else void this.beginResponse();
      return;
    }
    const turn = this._turn;
    if (turn === null || event.runId !== turn.runId || !this.isCurrentTurn(turn)) return;
    if (event.type === 'assistant.text') {
      this._assistantDraft.update((current) => (current + event.text).slice(-40_000));
      for (const sentence of turn.sentences.append(event.text))
        this.enqueueSentence(turn, sentence);
    } else if (event.type === 'assistant.completed') {
      turn.completed = true;
      this._responsePending.set(false);
      for (const sentence of turn.sentences.finish()) this.enqueueSentence(turn, sentence);
      this.finishTurnIfDrained(turn);
    } else if (event.type === 'assistant.failed') {
      if (!event.cancelled) this._error.set(event.message);
      void this.interrupt();
    }
  }

  private async beginResponse(): Promise<void> {
    const sessionId = this.requireLiveSession();
    const generation = this._generation;
    const revision = ++this._turnRevision;
    const old = this.detachTurn();
    this._responsePending.set(true);
    this._assistantDraft.set('');
    this._error.set(null);
    this._turnStartedAt = this._runtime.now();
    const operation = this._turnSerial
      .catch(() => undefined)
      .then(async () => {
        await this.cancelNativeTurn(sessionId, old);
        if (!this.isCurrentRevision(generation, revision)) return;
        await this.setRecognition(false, generation, revision);
        if (!this.isCurrentRevision(generation, revision)) return;
        const turn: IResponseTurn = {
          sessionId,
          generation,
          revision,
          runId: crypto.randomUUID(),
          sentences: new SpokenSentenceBuffer(),
          tail: Promise.resolve(),
          completed: false,
          queuedSentences: 0,
          queuedCharacters: 0,
        };
        this._turn = turn;
        await this._host.respond({ sessionId, runId: turn.runId });
        if (this.isCurrentTurn(turn) && turn.queuedSentences === 0 && !turn.completed) {
          await this.setRecognition(true, generation, revision);
        }
      });
    this._turnSerial = operation;
    await operation.catch(async (error: unknown) => {
      if (this.isCurrentRevision(generation, revision)) await this.failLive(error, sessionId);
    });
  }

  private enqueueSentence(turn: IResponseTurn, text: string): void {
    if (!this.isCurrentTurn(turn) || this._assistantMuted() || text.length === 0) return;
    if (turn.queuedSentences >= 64 || turn.queuedCharacters + text.length > 16_000) {
      void this.failLive(
        new Error('Die Sprachausgabe kann mit der Antwort nicht Schritt halten.'),
        turn.sessionId,
      );
      return;
    }
    ++turn.queuedSentences;
    turn.queuedCharacters += text.length;
    this._queuedSentences.set(turn.queuedSentences);
    const outputRevision = this._outputRevision;
    const isCurrentOutput = (): boolean =>
      this.isCurrentTurn(turn) &&
      outputRevision === this._outputRevision &&
      !this._assistantMuted();
    turn.tail = turn.tail
      .then(async () => {
        if (!isCurrentOutput()) return;
        const speechId = crypto.randomUUID();
        const result = await this._host.speechSynthesize({
          sessionId: turn.sessionId,
          speechId,
          text,
          ...(this._options?.voice === undefined ? {} : { voice: this._options.voice }),
        });
        if (!isCurrentOutput()) return;
        const expectedUrl = `resonanz-voice://session/${turn.sessionId}/${speechId}`;
        if (result.audioUrl !== expectedUrl)
          throw new Error('Die native Sprachausgabe hat keine gültige Audiodatei geliefert.');
        await this.setRecognition(false, turn.generation, turn.revision);
        if (!isCurrentOutput()) return;
        const played = await this.playClip(result.audioUrl, isCurrentOutput);
        if (played !== null && isCurrentOutput()) {
          this._transcriptQueue?.enqueue({
            sessionId: turn.sessionId,
            id: speechId,
            speaker: 'assistant',
            text,
            startMs: played.startMs,
            endMs: played.endMs,
            final: true,
          });
        }
      })
      .catch((error: unknown) => {
        if (isCurrentOutput()) void this.failLive(error, turn.sessionId);
      })
      .finally(() => {
        --turn.queuedSentences;
        turn.queuedCharacters -= text.length;
        if (this.isCurrentTurn(turn)) {
          this._queuedSentences.set(turn.queuedSentences);
          this.finishTurnIfDrained(turn);
        }
      });
  }

  private playClip(
    audioUrl: string,
    isCurrent: () => boolean,
  ): Promise<{ readonly startMs: number; readonly endMs: number } | null> {
    const audio = this._audio;
    if (audio === null || !isCurrent()) return Promise.resolve(null);
    this._voiceGate.reset();
    this._playbackActive = true;
    return new Promise((resolve, reject) => {
      let startedAt: number | null = null;
      let finished = false;
      let timeout: ReturnType<typeof globalThis.setTimeout>;
      const finish = (played: boolean, error?: Error): void => {
        if (finished) return;
        finished = true;
        globalThis.clearTimeout(timeout);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('playing', onPlaying);
        audio.removeEventListener('loadedmetadata', onMetadata);
        if (this._cancelPlayback === cancel) this._cancelPlayback = null;
        this._playbackActive = false;
        this._speaking.set(false);
        if (startedAt !== null) this._lastPlaybackEndedAt = this._runtime.now();
        if (error !== undefined) reject(error);
        else
          resolve(
            played && startedAt !== null
              ? { startMs: startedAt, endMs: this._mixer?.durationMs ?? this._durationMs() }
              : null,
          );
      };
      const armTimeout = (durationMs: number): void => {
        globalThis.clearTimeout(timeout);
        timeout = globalThis.setTimeout(
          () => finish(false, new Error('Die native Sprachausgabe hat zu lange gedauert.')),
          durationMs,
        );
      };
      const onPlaying = (): void => {
        if (!isCurrent()) {
          finish(false);
          return;
        }
        startedAt ??= this._mixer?.durationMs ?? this._durationMs();
        this._speaking.set(true);
      };
      const onEnded = (): void => finish(isCurrent());
      const onError = (): void =>
        finish(false, new Error('Die native Sprachausgabe konnte nicht abgespielt werden.'));
      const onMetadata = (): void => {
        if (Number.isFinite(audio.duration))
          armTimeout(Math.min(600_000, Math.max(15_000, audio.duration * 1_000 + 10_000)));
      };
      const cancel = (): void => finish(false);
      this._cancelPlayback = cancel;
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      audio.addEventListener('playing', onPlaying);
      audio.addEventListener('loadedmetadata', onMetadata);
      armTimeout(30_000);
      audio.src = audioUrl;
      this._mixer?.setAssistantAudible(!this._assistantMuted());
      void audio.play().catch((error: unknown) => finish(false, this.toError(error)));
    });
  }

  private finishTurnIfDrained(turn: IResponseTurn): void {
    if (!this.isCurrentTurn(turn) || !turn.completed || turn.queuedSentences !== 0) return;
    this._turn = null;
    this._responsePending.set(false);
    this._queuedSentences.set(0);
    void this.setRecognition(true, turn.generation, turn.revision).catch((error: unknown) => {
      if (this.isCurrentRevision(turn.generation, turn.revision))
        void this.failLive(error, turn.sessionId);
    });
  }

  private detachTurn(): IResponseTurn | null {
    const old = this._turn;
    this._turn = null;
    ++this._outputRevision;
    this._responsePending.set(false);
    this._queuedSentences.set(0);
    this.stopPlayback();
    this._voiceGate.reset();
    return old;
  }

  private stopPlayback(): void {
    this._cancelPlayback?.();
    this._cancelPlayback = null;
    this._audio?.pause();
    this._audio?.removeAttribute('src');
    this._audio?.load();
    this._playbackActive = false;
    this._speaking.set(false);
    this._assistantLevel.set(0);
  }

  private async cancelNativeTurn(sessionId: string, turn: IResponseTurn | null): Promise<void> {
    const outcomes = await Promise.allSettled([
      this._host.speechCancel({ sessionId }),
      ...(turn !== null && !turn.completed
        ? [this._host.cancelResponse({ runId: turn.runId })]
        : []),
    ]);
    const failure = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }

  private setRecognition(enabled: boolean, generation: number, revision: number): Promise<void> {
    const sessionId = this._sessionId();
    if (sessionId === null) return Promise.resolve();
    const operation = this._recognitionSerial
      .catch(() => undefined)
      .then(async () => {
        if (!this.isCurrentRevision(generation, revision)) return;
        if (enabled) {
          const remaining = 180 - (this._runtime.now() - this._lastPlaybackEndedAt);
          if (remaining > 0) {
            this.clearEchoTimer();
            await new Promise<void>((resolve) => {
              this._resolveEcho = resolve;
              this._echoTimer = globalThis.setTimeout(() => this.clearEchoTimer(), remaining);
            });
          }
        }
        if (!this.isCurrentRevision(generation, revision)) return;
        const desired = enabled && !this._microphoneMuted() && !this._playbackActive;
        const result = await this._host.speechListen({ sessionId, enabled: desired });
        if (!this.isCurrentRevision(generation, revision)) return;
        this._listening.set(result.listening && desired);
        if (desired !== result.listening)
          throw new Error(
            desired
              ? 'Die native Spracherkennung konnte nicht fortgesetzt werden.'
              : 'Die native Spracherkennung konnte für die Ausgabe nicht pausiert werden.',
          );
        this._voiceGate.reset();
      });
    this._recognitionSerial = operation;
    return operation;
  }

  private clearEchoTimer(): void {
    if (this._echoTimer !== null) globalThis.clearTimeout(this._echoTimer);
    this._echoTimer = null;
    const resolve = this._resolveEcho;
    this._resolveEcho = null;
    resolve?.();
  }

  private async startMicrophone(generation: number): Promise<void> {
    await this._recorder.start({
      preferredMimeTypes: [this._options?.mimeType ?? 'audio/webm'],
      retention: 'none',
      chunkIntervalMs: 1_000,
      audioConstraints: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (generation !== this._generation) return;
    this._recorder.setMuted(this._microphoneMuted());
    const stream = this._recorder.mediaStream();
    if (stream === null) throw new Error('Das Mikrofon hat keinen Audiostream bereitgestellt.');
    this._frameSubscription?.unsubscribe();
    this._frameSubscription = this._capture.frameAvailable.subscribe((frame) => {
      if (generation !== this._generation) return;
      const samples = new Int16Array(frame.data);
      let energy = 0;
      for (const sample of samples) energy += (sample / 32_768) ** 2;
      const rms = Math.sqrt(energy / Math.max(1, samples.length));
      this._microphoneLevel.set(Math.min(1, rms * 5));
      const suppressed =
        this._state() === 'live' &&
        !this._listening() &&
        !this._microphoneMuted() &&
        this._turn !== null;
      if (
        this._voiceGate.observe(
          rms,
          frame.durationMs,
          suppressed,
          this._runtime.now() - this._turnStartedAt,
        ) &&
        !this._bargeInPending
      ) {
        this._bargeInPending = true;
        void this.interrupt().finally(() => {
          if (generation === this._generation) this._bargeInPending = false;
        });
      }
    });
    await this._capture.start(stream, { frameDurationMs: 20 });
  }

  private startActivityTimer(): void {
    if (this._activityTimer !== null) globalThis.clearInterval(this._activityTimer);
    this._activityTimer = globalThis.setInterval(() => {
      this._durationMs.set(this._mixer?.durationMs ?? this._durationMs());
      this._assistantLevel.set(
        this._speaking() && !this._assistantMuted() ? (this._mixer?.readAssistantLevel() ?? 0) : 0,
      );
    }, 100);
  }

  private async stopMicrophone(): Promise<void> {
    if (!this._lease.owns(this._owner)) return;
    this._frameSubscription?.unsubscribe();
    this._frameSubscription = null;
    const outcomes = await Promise.allSettled([this._capture.stop(), this._recorder.stop()]);
    this._microphoneLevel.set(0);
    const failure = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }

  private async suspendCapture(sessionId: string, old: IResponseTurn | null): Promise<void> {
    let failure: unknown;
    const attempt = async (operation: () => Promise<unknown>): Promise<void> => {
      try {
        await operation();
      } catch (error: unknown) {
        failure ??= error;
      }
    };
    await attempt(() => this.stopMicrophone());
    await this._turnSerial.catch(() => undefined);
    await this._recognitionSerial.catch(() => undefined);
    await attempt(() => this.cancelNativeTurn(sessionId, old));
    await attempt(() => this._host.speechStop({ sessionId }));
    await attempt(
      () => this._host.setCaptureStatus?.({ sessionId, status: 'paused' }) ?? Promise.resolve(),
    );
    await attempt(() => this._transcriptQueue?.flush() ?? Promise.resolve());
    if (failure !== undefined) throw failure;
  }

  private async finishCapture(sessionId: string | null, old: IResponseTurn | null): Promise<void> {
    let failure: unknown;
    const attempt = async (operation: () => Promise<unknown>): Promise<void> => {
      try {
        await operation();
      } catch (error: unknown) {
        failure ??= error;
      }
    };
    await this._pausePromise?.catch(() => undefined);
    await attempt(() => this.stopMicrophone());
    await this._turnSerial.catch(() => undefined);
    await this._recognitionSerial.catch(() => undefined);
    if (sessionId !== null) {
      await attempt(() => this.cancelNativeTurn(sessionId, old));
      await attempt(() => this._host.speechStop({ sessionId }));
    }
    await attempt(() => this._mixer?.stop() ?? Promise.resolve());
    this._durationMs.set(this._mixer?.durationMs ?? this._durationMs());
    await attempt(() => this._writer?.close() ?? Promise.resolve());
    await attempt(() => this._transcriptQueue?.flush() ?? Promise.resolve());
    if (this._activityTimer !== null) globalThis.clearInterval(this._activityTimer);
    this._activityTimer = null;
    this.stopPlayback();
    this._audio = null;
    this._mixer = null;
    this._writer = null;
    this._transcriptQueue = null;
    this._options = null;
    this._pendingBytes.set(0);
    if (sessionId !== null) {
      const error = failure === undefined ? this._error() : this.toError(failure).message;
      await attempt(() =>
        this._host.finishSession({
          sessionId,
          durationMs: this._durationMs(),
          error: error === null ? undefined : error.slice(0, 1_000),
        }),
      );
    }
    if (failure !== undefined) throw failure;
  }

  private requireLiveSession(): string {
    const sessionId = this._sessionId();
    if (this._state() !== 'live' || sessionId === null)
      throw new Error('Die Live-Unterhaltung ist noch nicht bereit.');
    return sessionId;
  }

  private isCurrentRevision(generation: number, revision: number): boolean {
    return (
      generation === this._generation && revision === this._turnRevision && this._state() === 'live'
    );
  }

  private isCurrentTurn(turn: IResponseTurn): boolean {
    return (
      turn === this._turn &&
      turn.sessionId === this._sessionId() &&
      this.isCurrentRevision(turn.generation, turn.revision)
    );
  }

  private async failLive(error: unknown, sessionId: string | null): Promise<void> {
    if (sessionId !== this._sessionId() || ['stopping', 'disposed'].includes(this._state())) return;
    this._error.set(this.toError(error).message);
    await this.stop().catch(() => undefined);
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  // #endregion
}
