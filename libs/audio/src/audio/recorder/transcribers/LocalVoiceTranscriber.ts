// #region Imports

import { ILocalVoiceTranscriberOptions } from './interfaces/ILocalVoiceTranscriberOptions';
import { ITranscriptionInput } from './interfaces/ITranscriptionInput';
import { ILiveVoiceTranscriber } from './interfaces/IVoiceTranscriber';

// #endregion

/**
 * A local (browser-based) implementation of {@link ILiveVoiceTranscriber}.
 * Uses the Web Speech API if available.
 *
 * @public
 */
export class LocalVoiceTranscriber implements ILiveVoiceTranscriber {
    // #region Fields

    private readonly _language: string;
    private readonly _interimResults: boolean;
    private readonly _maxAlternatives: number;

    private _completedError: Error | null = null;
    private _completedTranscript = '';
    private _finalTranscript = '';
    private _interimTranscript = '';
    private _mode: RecognitionMode = 'single';
    private _audioTrack: MediaStreamTrack | null = null;
    private _recognition: ISpeechRecognition | null = null;
    private _resolveSession: ((transcript: string) => void) | null = null;
    private _sessionPromise: Promise<string> | null = null;
    private _stopRequested = false;

    // #endregion

    // #region Ctor

    /**
     * Creates a new instance of {@link LocalVoiceTranscriber}.
     *
     * @param options Configuration for the local voice transcriber.
     */
    public constructor(options: ILocalVoiceTranscriberOptions) {
        this._language = options.language ?? 'en-US';
        this._interimResults = options.interimResults ?? false;
        this._maxAlternatives = options.maxAlternatives ?? 1;
    }

    // #endregion

    // #region Properties

    /**
     * Indicates that this browser strategy recognizes speech while a session is active.
     *
     * @public
     * @readonly
     */
    public readonly supportsLiveSessions = true as const;

    // #endregion

    // #region Methods

    /**
     * Starts continuous recognition that remains active across speech pauses until stopped.
     *
     * @param audioTrack Already authorized live microphone track to recognize instead of the browser default.
     * @public
     */
    public startSession(audioTrack?: MediaStreamTrack): Promise<void> {
        return this.beginRecognition('manual', audioTrack);
    }

    /**
     * Stops a manually controlled recognition session and returns its accumulated text.
     *
     * @public
     */
    public async stopSession(): Promise<string> {
        const sessionPromise = this._sessionPromise;

        if (!sessionPromise) {
            return this.readCompletedTranscript();
        }

        this._stopRequested = true;

        if (this._recognition) {
            try {
                this._recognition.stop();
            } catch (error: unknown) {
                this.completeSession(this.toError(error));
            }
        } else {
            this.completeSession();
        }

        await sessionPromise;
        return this.readCompletedTranscript();
    }

    /**
     * Aborts an active recognition session and discards its result.
     *
     * @public
     */
    public cancelSession(): void {
        const recognition = this._recognition;

        this._completedError = null;
        this._completedTranscript = '';
        this._finalTranscript = '';
        this._interimTranscript = '';
        this._stopRequested = true;

        if (recognition) {
            try {
                recognition.abort();
            } catch {
                /** The recognition engine already ended and is cleaned up below. */
            }
        }

        this.completeSession();
        this._completedTranscript = '';
    }

    /**
     * Transcribes the provided audio blob into text.
     *
     * @public
     * @param input The audio input to transcribe.
     * @returns The transcribed text.
     */
    public async transcribe(input: ITranscriptionInput): Promise<string> {
        void input;

        await this.beginRecognition('single');
        await this._sessionPromise;

        return this.readCompletedTranscript();
    }

    private async beginRecognition(mode: RecognitionMode, audioTrack?: MediaStreamTrack): Promise<void> {
        if (this._sessionPromise) {
            throw new Error('A speech recognition session is already active.');
        }

        const RecognitionCtor = this.resolveRecognitionConstructor();

        this._completedError = null;
        this._completedTranscript = '';
        this._finalTranscript = '';
        this._interimTranscript = '';
        this._mode = mode;
        this._audioTrack = audioTrack ?? null;
        this._recognition = null;
        this._stopRequested = false;
        this._sessionPromise = new Promise<string>((resolve) => {
            this._resolveSession = resolve;
        });

        const sessionPromise = this._sessionPromise;
        const processLocally = await this.prepareLocalDictation(RecognitionCtor);

        if (sessionPromise !== this._sessionPromise) {
            return;
        }

        const recognition = new RecognitionCtor();

        recognition.continuous = mode === 'manual';
        recognition.interimResults = mode === 'manual' ? true : this._interimResults;
        recognition.lang = this._language;
        recognition.maxAlternatives = this._maxAlternatives;
        recognition.processLocally = processLocally;
        recognition.onend = () => this.onRecognitionEnd(recognition);
        recognition.onerror = (event: SpeechRecognitionErrorEvent) => this.onRecognitionError(recognition, event);
        recognition.onresult = (event: SpeechRecognitionEvent) => this.onRecognitionResult(recognition, event);
        this._recognition = recognition;

        const startError = this.startRecognition(recognition);

        if (startError) {
            throw startError;
        }
    }

    private collectTranscript(event: SpeechRecognitionEvent): void {
        let interimTranscript = '';

        for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = result?.[0]?.transcript ?? '';

            if (result?.isFinal) {
                this._finalTranscript = this.joinText(this._finalTranscript, transcript);
            } else {
                interimTranscript = this.joinText(interimTranscript, transcript);
            }
        }

        this._interimTranscript = interimTranscript;
    }

    private completeSession(error?: Error): void {
        const resolve = this._resolveSession;
        const transcript = this.joinText(this._finalTranscript, this._interimTranscript);

        this._completedError = error ?? null;
        this._completedTranscript = error ? '' : transcript;
        this._audioTrack = null;
        this._recognition = null;
        this._resolveSession = null;
        this._sessionPromise = null;
        this._stopRequested = false;
        resolve?.(this._completedTranscript);
    }

    private joinText(existingText: string, nextText: string): string {
        const normalizedExistingText = existingText.trim();
        const normalizedNextText = nextText.trim();

        if (!normalizedExistingText) {
            return normalizedNextText;
        }

        if (!normalizedNextText) {
            return normalizedExistingText;
        }

        return `${normalizedExistingText} ${normalizedNextText}`;
    }

    private onRecognitionEnd(recognition: ISpeechRecognition): void {
        if (recognition !== this._recognition) {
            return;
        }

        if (this._mode === 'single' || this._stopRequested) {
            this.completeSession();
            return;
        }

        this._finalTranscript = this.joinText(this._finalTranscript, this._interimTranscript);
        this._interimTranscript = '';

        queueMicrotask(() => {
            if (recognition === this._recognition && !this._stopRequested) {
                this.startRecognition(recognition);
            }
        });
    }

    private onRecognitionError(recognition: ISpeechRecognition, event: SpeechRecognitionErrorEvent): void {
        if (recognition !== this._recognition) {
            return;
        }

        if (this._mode === 'manual' && !this._stopRequested && event.error === 'no-speech') {
            return;
        }

        this.completeSession(new Error(event.error));
    }

    private onRecognitionResult(recognition: ISpeechRecognition, event: SpeechRecognitionEvent): void {
        if (recognition !== this._recognition) {
            return;
        }

        this.collectTranscript(event);

        if (this._mode === 'single') {
            this._stopRequested = true;

            try {
                recognition.stop();
            } catch {
                /** The single-shot result is already complete. */
            }

            this.completeSession();
        }
    }

    private async prepareLocalDictation(RecognitionCtor: SpeechRecognitionConstructor): Promise<boolean> {
        if (!RecognitionCtor.available) {
            return false;
        }

        const options: ISpeechRecognitionOptions = {
            langs: [this._language],
            processLocally: true,
            quality: 'dictation'
        };

        try {
            const availability = await RecognitionCtor.available(options);

            if (availability === 'available') {
                return true;
            }

            if ((availability === 'downloadable' || availability === 'downloading') && RecognitionCtor.install) {
                void RecognitionCtor.install(options).catch(() => false);
            }
        } catch {
            /** Local recognition is an enhancement; remote browser recognition remains available. */
        }

        return false;
    }

    private readCompletedTranscript(): string {
        const error = this._completedError;

        this._completedError = null;

        if (error) {
            throw error;
        }

        return this._completedTranscript;
    }

    private resolveRecognitionConstructor(): SpeechRecognitionConstructor {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            throw new Error('SpeechRecognition API not supported in this browser.');
        }

        const speechWindow = window as unknown as ISpeechRecognitionWindow;
        const RecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

        if (!RecognitionCtor) {
            throw new Error('SpeechRecognition constructor not available.');
        }

        return RecognitionCtor;
    }

    private startRecognition(recognition: ISpeechRecognition): Error | null {
        try {
            const audioTrack = this._audioTrack;

            if (audioTrack?.readyState === 'live') {
                recognition.start(audioTrack);
            } else {
                recognition.start();
            }

            return null;
        } catch (error: unknown) {
            const recognitionError = this.toError(error);

            this.completeSession(recognitionError);
            return recognitionError;
        }
    }

    private toError(error: unknown): Error {
        return error instanceof Error ? error : new Error(String(error));
    }

    // #endregion
}

type RecognitionMode = 'manual' | 'single';

interface ISpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    processLocally: boolean;
    start(audioTrack?: MediaStreamTrack): void;
    stop(): void;
    abort(): void;
    onaudioend?: (event: Event) => void;
    onaudiostart?: (event: Event) => void;
    onend?: (event: Event) => void;
    onerror?: (event: SpeechRecognitionErrorEvent) => void;
    onnomatch?: (event: SpeechRecognitionEvent) => void;
    onresult?: (event: SpeechRecognitionEvent) => void;
    onsoundend?: (event: Event) => void;
    onsoundstart?: (event: Event) => void;
    onspeechend?: (event: Event) => void;
    onspeechstart?: (event: Event) => void;
    onstart?: (event: Event) => void;
}

interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
}

type SpeechRecognitionAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface ISpeechRecognitionOptions {
    readonly langs: readonly string[];
    readonly processLocally: boolean;
    readonly quality: 'command' | 'conversation' | 'dictation';
}

interface SpeechRecognitionConstructor {
    new (): ISpeechRecognition;
    available?(options: ISpeechRecognitionOptions): Promise<SpeechRecognitionAvailability>;
    install?(options: ISpeechRecognitionOptions): Promise<boolean>;
}

interface ISpeechRecognitionWindow extends Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
