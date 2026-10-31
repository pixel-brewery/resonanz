// #region Imports

import { inject, Injectable, NgZone, Signal, signal, type WritableSignal } from '@angular/core';

// #endregion

/**
 * Options for text-to-speech synthesis.
 *
 * @public
 */
export interface ITextToSpeechOptions {
    /**
     * The language code (e.g., 'de-DE', 'en-US').
     */
    readonly lang?: string;

    /**
     * The speaking rate (0.1 to 10, default 1).
     */
    readonly rate?: number;

    /**
     * The pitch (0 to 2, default 1).
     */
    readonly pitch?: number;

    /**
     * The volume (0 to 1, default 1).
     */
    readonly volume?: number;

    /**
     * The name of the voice to use.
     */
    readonly voiceName?: string;
}

/**
 * Service for text-to-speech synthesis using the Web Speech API.
 *
 * @public
 */
@Injectable({
    providedIn: 'root'
})
export class TextToSpeechService {
    // #region Fields

    private readonly _zone: NgZone = inject(NgZone);
    private readonly _isSpeaking: WritableSignal<boolean> = signal<boolean>(false);
    private readonly _isPaused: WritableSignal<boolean> = signal<boolean>(false);
    private readonly _isSupported: WritableSignal<boolean> = signal<boolean>(false);
    private readonly _error: WritableSignal<string | null> = signal<string | null>(null);
    private readonly _voices: WritableSignal<ReadonlyArray<SpeechSynthesisVoice>> = signal<
        ReadonlyArray<SpeechSynthesisVoice>
    >([]);

    private _currentUtterance: SpeechSynthesisUtterance | null = null;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new {@link TextToSpeechService} instance.
     *
     * @public
     */
    public constructor() {
        this._isSupported.set('speechSynthesis' in window);

        if (this._isSupported()) {
            this.loadVoices();

            // Voices may load asynchronously
            if (speechSynthesis.onvoiceschanged !== undefined) {
                speechSynthesis.onvoiceschanged = (): void => this.loadVoices();
            }
        }
    }

    // #endregion

    // #region Properties

    /**
     * Whether the browser supports the Web Speech API.
     *
     * @public
     * @readonly
     */
    public get isSupported(): Signal<boolean> {
        return this._isSupported.asReadonly();
    }

    /**
     * Whether speech is currently being synthesized.
     *
     * @public
     * @readonly
     */
    public get isSpeaking(): Signal<boolean> {
        return this._isSpeaking.asReadonly();
    }

    /**
     * Whether speech synthesis is paused.
     *
     * @public
     * @readonly
     */
    public get isPaused(): Signal<boolean> {
        return this._isPaused.asReadonly();
    }

    /**
     * The last error message, if any.
     *
     * @public
     * @readonly
     */
    public get error(): Signal<string | null> {
        return this._error.asReadonly();
    }

    /**
     * Available speech synthesis voices.
     *
     * @public
     * @readonly
     */
    public get voices(): Signal<ReadonlyArray<SpeechSynthesisVoice>> {
        return this._voices.asReadonly();
    }

    // #endregion

    // #region Methods

    /**
     * Speaks the given text using the Web Speech API.
     *
     * @param text - The text to speak.
     * @param options - Optional speech synthesis options.
     * @returns A promise that resolves when speech has finished.
     *
     * @public
     */
    public speak(text: string, options?: ITextToSpeechOptions | null): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this._isSupported()) {
                const errorMessage = 'Text-to-speech is not supported in this browser';
                this._error.set(errorMessage);
                reject(new Error(errorMessage));

                return;
            }

            // Cancel any ongoing speech
            this.stop();
            this._error.set(null);

            const utterance = new SpeechSynthesisUtterance(text);

            // Apply options
            if (options?.lang) {
                utterance.lang = options.lang;
            }
            if (options?.rate != null) {
                utterance.rate = Math.max(0.1, Math.min(10, options.rate));
            }
            if (options?.pitch != null) {
                utterance.pitch = Math.max(0, Math.min(2, options.pitch));
            }
            if (options?.volume != null) {
                utterance.volume = Math.max(0, Math.min(1, options.volume));
            }
            if (options?.voiceName) {
                const voice = this._voices().find((v) => v.name === options.voiceName);

                if (voice) {
                    utterance.voice = voice;
                }
            }

            utterance.onstart = (): void => {
                this._zone.run(() => {
                    this._isSpeaking.set(true);
                    this._isPaused.set(false);
                });
            };

            utterance.onend = (): void => {
                this._zone.run(() => {
                    this._isSpeaking.set(false);
                    this._isPaused.set(false);
                    this._currentUtterance = null;
                });
                resolve();
            };

            utterance.onerror = (event: SpeechSynthesisErrorEvent): void => {
                // 'interrupted' and 'canceled' are not real errors
                if (event.error === 'interrupted' || event.error === 'canceled') {
                    this._zone.run(() => {
                        this._isSpeaking.set(false);
                        this._isPaused.set(false);
                        this._currentUtterance = null;
                    });
                    resolve();

                    return;
                }

                const errorMessage = `Speech synthesis error: ${event.error}`;
                this._zone.run(() => {
                    this._error.set(errorMessage);
                    this._isSpeaking.set(false);
                    this._isPaused.set(false);
                    this._currentUtterance = null;
                });
                reject(new Error(errorMessage));
            };

            utterance.onpause = (): void => {
                this._zone.run(() => {
                    this._isPaused.set(true);
                });
            };

            utterance.onresume = (): void => {
                this._zone.run(() => {
                    this._isPaused.set(false);
                });
            };

            this._currentUtterance = utterance;
            speechSynthesis.speak(utterance);
        });
    }

    /**
     * Pauses the current speech synthesis.
     *
     * @public
     */
    public pause(): void {
        if (this._isSupported() && this._isSpeaking()) {
            speechSynthesis.pause();
        }
    }

    /**
     * Resumes paused speech synthesis.
     *
     * @public
     */
    public resume(): void {
        if (this._isSupported() && this._isPaused()) {
            speechSynthesis.resume();
        }
    }

    /**
     * Stops all speech synthesis.
     *
     * @public
     */
    public stop(): void {
        if (this._isSupported()) {
            speechSynthesis.cancel();
            this._isSpeaking.set(false);
            this._isPaused.set(false);
            this._currentUtterance = null;
        }
    }

    /**
     * Toggles speech: if speaking, stops; otherwise speaks the given text.
     *
     * @param text - The text to speak if not currently speaking.
     * @param options - Optional speech synthesis options.
     * @returns A promise that resolves when the action completes.
     *
     * @public
     */
    public async toggle(text: string, options?: ITextToSpeechOptions | null): Promise<void> {
        if (this._isSpeaking()) {
            this.stop();
        } else {
            await this.speak(text, options);
        }
    }

    /**
     * Gets voices for a specific language.
     *
     * @param lang - The language code (e.g., 'de', 'en-US').
     * @returns Voices matching the language.
     *
     * @public
     */
    public getVoicesForLanguage(lang: string): ReadonlyArray<SpeechSynthesisVoice> {
        const normalizedLang = lang.toLowerCase();

        return this._voices().filter(
            (voice) =>
                voice.lang.toLowerCase().startsWith(normalizedLang) || voice.lang.toLowerCase() === normalizedLang
        );
    }

    /**
     * Loads available voices from the speech synthesis API.
     */
    private loadVoices(): void {
        const voices = speechSynthesis.getVoices();
        this._zone.run(() => {
            this._voices.set(voices);
        });
    }

    // #endregion
}
