// #region Imports

import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import type { IAudioPlayOptions } from './IAudioPlayOptions';
import type { IAudioSource } from './IAudioSource';

// #endregion

/**
 * Plays seekable audio and externally owned live media streams through one audio element.
 *
 * @public
 */
export class AudioPlayer {
    // #region Fields

    private readonly _destroyRef: DestroyRef = inject(DestroyRef);
    private readonly _currentTime = signal<number>(0);
    private readonly _duration = signal<number>(0);
    private readonly _error = signal<string | null>(null);
    private readonly _isMuted = signal<boolean>(false);
    private readonly _isPaused = signal<boolean>(false);
    private readonly _isPlaying = signal<boolean>(false);
    private readonly _loop = signal<boolean>(false);
    private readonly _sourceStream = signal<MediaStream | null>(null);
    private readonly _sourceUrl = signal<string | null>(null);
    private readonly _timeLabel = computed<string>(() => {
        return `${this.formatTime(this._currentTime())} / ${this.formatTime(this._duration())}`;
    });
    private readonly _volume = signal<number>(1);
    private _audio: HTMLAudioElement | null = null;
    private _blobUrl: string | null = null;
    private _eventAbortController: AbortController | null = null;
    private _rafId: number | null = null;

    // #endregion

    // #region Ctor

    /**
     * Creates a player whose browser resources follow the Angular injection lifecycle.
     *
     * @public
     */
    public constructor() {
        this._destroyRef.onDestroy(() => this.dispose());
    }

    // #endregion

    // #region Properties

    /**
     * Current playback position in seconds.
     *
     * @public
     * @readonly
     */
    public get currentTime(): Signal<number> {
        return this._currentTime.asReadonly();
    }

    /**
     * Duration of a seekable source in seconds, or zero for an unknown live duration.
     *
     * @public
     * @readonly
     */
    public get duration(): Signal<number> {
        return this._duration.asReadonly();
    }

    /**
     * Last playback failure message.
     *
     * @public
     * @readonly
     */
    public get error(): Signal<string | null> {
        return this._error.asReadonly();
    }

    /**
     * Indicates whether output is muted without changing the retained volume.
     *
     * @public
     * @readonly
     */
    public get isMuted(): Signal<boolean> {
        return this._isMuted.asReadonly();
    }

    /**
     * Indicates whether playback is paused after having started.
     *
     * @public
     * @readonly
     */
    public get isPaused(): Signal<boolean> {
        return this._isPaused.asReadonly();
    }

    /**
     * Indicates whether audio is actively playing.
     *
     * @public
     * @readonly
     */
    public get isPlaying(): Signal<boolean> {
        return this._isPlaying.asReadonly();
    }

    /**
     * Current loop setting.
     *
     * @public
     * @readonly
     */
    public get loop(): Signal<boolean> {
        return this._loop.asReadonly();
    }

    /**
     * Externally owned live stream currently attached to the audio element.
     *
     * @public
     * @readonly
     */
    public get sourceStream(): Signal<MediaStream | null> {
        return this._sourceStream.asReadonly();
    }

    /**
     * Current URL source, including object URLs created for blobs.
     *
     * @public
     * @readonly
     */
    public get sourceUrl(): Signal<string | null> {
        return this._sourceUrl.asReadonly();
    }

    /**
     * Current and total duration formatted for display.
     *
     * @public
     * @readonly
     */
    public get timeLabel(): Signal<string> {
        return this._timeLabel;
    }

    /**
     * Playback volume in the inclusive range from zero to one.
     *
     * @public
     * @readonly
     */
    public get volume(): Signal<number> {
        return this._volume.asReadonly();
    }

    // #endregion

    // #region Methods

    /**
     * Loads a URL, blob, or live stream without starting playback.
     *
     * @param source - Source to attach to the audio element.
     * @public
     */
    public load(source: IAudioSource): void {
        const audio = this.ensureElement();

        this.releaseSource();
        this._error.set(null);

        if (this.isMediaStream(source.src)) {
            audio.src = '';
            audio.srcObject = source.src;
            this._sourceStream.set(source.src);
        } else {
            const url = typeof source.src === 'string' ? source.src : this.createBlobUrl(source.src);

            audio.srcObject = null;
            audio.src = url;
            audio.load();
            this._sourceUrl.set(url);
        }

        audio.loop = this._loop();
        audio.muted = this._isMuted();
        audio.volume = this._volume();
        this.resetPlaybackState();
    }

    /**
     * Plays the current source and optionally loads a new one first.
     *
     * @param source - Optional source to load before playback.
     * @param options - Optional volume, loop, and seek settings.
     * @public
     */
    public async play(source?: IAudioSource | null, options?: IAudioPlayOptions | null): Promise<void> {
        if (source) {
            this.load(source);
        }

        const audio = this.ensureElement();

        if (options?.volume !== null && options?.volume !== undefined) {
            this.setVolume(options.volume);
        }

        if (options?.loop !== null && options?.loop !== undefined) {
            this.setLoop(options.loop);
        }

        if (options?.startAt !== null && options?.startAt !== undefined && !this._sourceStream()) {
            audio.currentTime = Math.max(0, options.startAt);
        }

        try {
            await audio.play();
            this._isPlaying.set(true);
            this._isPaused.set(false);
            this.startTicker();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Audio playback failed.';

            this._error.set(message);
            throw error;
        }
    }

    /**
     * Pauses playback without detaching the current source.
     *
     * @public
     */
    public pause(): void {
        if (!this._audio) {
            return;
        }

        this._audio.pause();
        this._isPlaying.set(false);
        this._isPaused.set(true);
        this.stopTicker();
    }

    /**
     * Stops playback and rewinds only seekable sources.
     *
     * @public
     */
    public stop(): void {
        if (!this._audio) {
            return;
        }

        this._audio.pause();

        if (!this._sourceStream()) {
            this._audio.currentTime = 0;
        }

        this._currentTime.set(0);
        this._isPlaying.set(false);
        this._isPaused.set(false);
        this.stopTicker();
    }

    /**
     * Changes playback volume while retaining the current source.
     *
     * @param value - Volume in the inclusive range from zero to one.
     * @public
     */
    public setVolume(value: number): void {
        const volume = Math.max(0, Math.min(1, value));

        this._volume.set(volume);

        if (this._audio) {
            this._audio.volume = volume;
        }
    }

    /**
     * Changes the loop behavior of seekable sources.
     *
     * @param value - True to loop playback.
     * @public
     */
    public setLoop(value: boolean): void {
        this._loop.set(Boolean(value));

        if (this._audio) {
            this._audio.loop = Boolean(value);
        }
    }

    /**
     * Mutes or unmutes output without replacing the configured volume.
     *
     * @param muted - True to silence playback.
     * @public
     */
    public setMuted(muted: boolean): void {
        this._isMuted.set(muted);

        if (this._audio) {
            this._audio.muted = muted;
        }
    }

    /**
     * Detaches sources and listeners without stopping externally owned media tracks.
     *
     * @public
     */
    public dispose(): void {
        this.stopTicker();

        if (this._audio) {
            this._audio.pause();
            this.releaseSource();
            this._audio.load();
        }

        this._eventAbortController?.abort();
        this._eventAbortController = null;
        this._audio = null;
        this.resetPlaybackState();
    }

    /**
     * Registers playback state handlers that can be removed together.
     *
     * @param audio - Audio element receiving handlers.
     * @private
     */
    private attachEvents(audio: HTMLAudioElement): void {
        this._eventAbortController?.abort();
        this._eventAbortController = new AbortController();

        const eventOptions: AddEventListenerOptions = {
            signal: this._eventAbortController.signal
        };

        audio.addEventListener(
            'loadedmetadata',
            () => {
                this._duration.set(Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0);
            },
            eventOptions
        );
        audio.addEventListener(
            'timeupdate',
            () => {
                this._currentTime.set(Math.max(0, audio.currentTime));
            },
            eventOptions
        );
        audio.addEventListener(
            'ended',
            () => {
                this._isPlaying.set(false);
                this._isPaused.set(false);

                if (!audio.loop) {
                    this.stopTicker();
                }
            },
            eventOptions
        );
        audio.addEventListener(
            'pause',
            () => {
                this._isPlaying.set(false);
                this.stopTicker();
            },
            eventOptions
        );
        audio.addEventListener(
            'play',
            () => {
                this._isPlaying.set(true);
                this._isPaused.set(false);
                this.startTicker();
            },
            eventOptions
        );
        audio.addEventListener(
            'error',
            () => {
                const mediaError = audio.error;

                this._error.set(mediaError ? `MediaError(${mediaError.code})` : 'Unknown audio error');
            },
            eventOptions
        );
    }

    /**
     * Creates an object URL whose lifetime is owned by this player.
     *
     * @param blob - Retained audio payload.
     * @private
     * @returns Browser object URL.
     */
    private createBlobUrl(blob: Blob): string {
        this._blobUrl = URL.createObjectURL(blob);

        return this._blobUrl;
    }

    /**
     * Lazily creates the browser audio element.
     *
     * @private
     * @returns Reusable audio element.
     */
    private ensureElement(): HTMLAudioElement {
        if (this._audio) {
            return this._audio;
        }

        const audio = new Audio();

        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        audio.loop = this._loop();
        audio.muted = this._isMuted();
        audio.volume = this._volume();
        this.attachEvents(audio);
        this._audio = audio;

        return audio;
    }

    /**
     * Formats a playback time value.
     *
     * @param seconds - Playback time in seconds.
     * @private
     * @returns `mm:ss` label.
     */
    private formatTime(seconds: number): string {
        const totalSeconds = Math.max(0, Math.floor(seconds));
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const remainingSeconds = String(totalSeconds % 60).padStart(2, '0');

        return `${minutes}:${remainingSeconds}`;
    }

    /**
     * Distinguishes live media streams from URL and blob sources.
     *
     * @param source - Source value to inspect.
     * @private
     * @returns True for a media stream.
     */
    private isMediaStream(source: string | Blob | MediaStream): source is MediaStream {
        return (
            typeof source === 'object' &&
            source !== null &&
            'getTracks' in source &&
            typeof source.getTracks === 'function'
        );
    }

    /**
     * Detaches the current source and revokes only player-owned object URLs.
     *
     * @private
     */
    private releaseSource(): void {
        if (this._blobUrl) {
            URL.revokeObjectURL(this._blobUrl);
            this._blobUrl = null;
        }

        if (this._audio) {
            this._audio.srcObject = null;
            this._audio.src = '';
        }

        this._sourceStream.set(null);
        this._sourceUrl.set(null);
    }

    /**
     * Resets observable playback state without changing player configuration.
     *
     * @private
     */
    private resetPlaybackState(): void {
        this._currentTime.set(0);
        this._duration.set(0);
        this._isPaused.set(false);
        this._isPlaying.set(false);
    }

    /**
     * Starts periodic playback position synchronization.
     *
     * @private
     */
    private startTicker(): void {
        if (this._rafId !== null) {
            return;
        }

        const tick = (): void => {
            if (!this._audio) {
                this._rafId = null;
                return;
            }

            this._currentTime.set(Math.max(0, this._audio.currentTime));
            this._rafId = globalThis.requestAnimationFrame(tick);
        };

        this._rafId = globalThis.requestAnimationFrame(tick);
    }

    /**
     * Stops periodic playback position synchronization.
     *
     * @private
     */
    private stopTicker(): void {
        if (this._rafId === null) {
            return;
        }

        globalThis.cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }

    // #endregion
}
