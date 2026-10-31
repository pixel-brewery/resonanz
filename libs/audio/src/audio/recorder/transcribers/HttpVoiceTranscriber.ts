// #region Imports

import { IHttpTranscriberOptions } from './interfaces/IHttpTranscriberOptions';
import { ITranscriptionInput } from './interfaces/ITranscriptionInput';
import { IVoiceTranscriber } from './interfaces/IVoiceTranscriber';

// #endregion

/**
 * HTTP-based implementation of {@link IVoiceTranscriber}.
 * Sends the audio as multipart/form-data to a backend that returns `{ text: string }`.
 *
 * @public
 */
export class HttpVoiceTranscriber implements IVoiceTranscriber {
    // #region Fields

    private readonly _url: string;
    private readonly _method: 'POST' | 'PUT';
    private readonly _fieldName: string;
    private readonly _headers: Readonly<Record<string, string>>;
    private readonly _extraFields: Readonly<Record<string, string>>;

    // #endregion

    // #region Ctor

    /**
     * Creates a new instance of {@link HttpVoiceTranscriber}.
     *
     * @param options Configuration for the HTTP call.
     */
    public constructor(options: IHttpTranscriberOptions) {
        this._url = options.url;
        this._method = options.method ?? 'POST';
        this._fieldName = options.fieldName ?? 'file';
        this._headers = Object.freeze({ ...(options.headers ?? {}) });
        this._extraFields = Object.freeze({ ...(options.extraFields ?? {}) });
    }

    // #endregion

    // #region Methods

    /**
     * Transcribes the provided audio blob into text.
     *
     * @public
     * @param input The audio input to transcribe.
     * @returns The transcribed text.
     */
    public async transcribe(input: ITranscriptionInput): Promise<string> {
        const filename: string = input.filename ?? 'voice.webm';
        const form: FormData = new FormData();
        form.append(this._fieldName, input.blob, filename);

        for (const [key, value] of Object.entries(this._extraFields)) {
            form.append(key, value);
        }

        const response: Response = await fetch(this._url, {
            method: this._method,
            headers: this._headers,
            body: form
        });

        if (!response.ok) {
            throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
        }

        // Expected payload: { text: string }
        const data: unknown = await response.json();
        const text: string | undefined = (data as { text?: string }).text;

        if (typeof text !== 'string') {
            throw new Error('Invalid transcription response payload.');
        }

        return text;
    }

    // #endregion
}
