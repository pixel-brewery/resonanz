import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpVoiceTranscriber } from './HttpVoiceTranscriber';
import { ITranscriptionInput } from './interfaces/ITranscriptionInput';

describe('HttpVoiceTranscriber', () => {
    let transcriber: HttpVoiceTranscriber;

    beforeEach(() => {
        transcriber = new HttpVoiceTranscriber({
            url: 'https://api.example.com/transcribe',
            method: 'POST',
            fieldName: 'audio',
            headers: { 'X-Api-Key': 'test-key' },
            extraFields: { language: 'en' }
        });
    });

    describe('transcribe', () => {
        it('should send audio blob as FormData to the configured URL', async () => {
            const mockResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue({ text: 'hello world' })
            };
            globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

            const input: ITranscriptionInput = {
                blob: new Blob(['audio-data'], { type: 'audio/webm' }),
                filename: 'recording.webm',
                mimeType: 'audio/webm'
            };

            const result = await transcriber.transcribe(input);

            expect(result).toBe('hello world');
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'https://api.example.com/transcribe',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'X-Api-Key': 'test-key' },
                    body: expect.any(FormData)
                })
            );
        });

        it('should use default filename when not provided', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ text: 'test' })
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' })
            };

            await transcriber.transcribe(input);

            const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const formData = fetchCall[1].body as FormData;
            const file = formData.get('audio') as File;
            expect(file.name).toBe('voice.webm');
        });

        it('should include extra fields in the FormData', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ text: 'result' })
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            await transcriber.transcribe(input);

            const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const formData = fetchCall[1].body as FormData;
            expect(formData.get('language')).toBe('en');
        });

        it('should throw on non-OK response', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            await expect(transcriber.transcribe(input)).rejects.toThrow(
                'Transcription failed: 500 Internal Server Error'
            );
        });

        it('should throw on invalid response payload', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ result: 'not text field' })
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            await expect(transcriber.transcribe(input)).rejects.toThrow('Invalid transcription response payload.');
        });

        it('should use PUT method when configured', async () => {
            const putTranscriber = new HttpVoiceTranscriber({
                url: 'https://api.example.com/transcribe',
                method: 'PUT'
            });

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ text: 'result' })
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            await putTranscriber.transcribe(input);

            expect(globalThis.fetch).toHaveBeenCalledWith(
                'https://api.example.com/transcribe',
                expect.objectContaining({ method: 'PUT' })
            );
        });

        it('should use default field name "file" when not configured', async () => {
            const defaultTranscriber = new HttpVoiceTranscriber({
                url: 'https://api.example.com/transcribe'
            });

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ text: 'result' })
            });

            const input: ITranscriptionInput = {
                blob: new Blob(['data'], { type: 'audio/webm' }),
                filename: 'test.webm'
            };

            await defaultTranscriber.transcribe(input);

            const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const formData = fetchCall[1].body as FormData;
            expect(formData.has('file')).toBe(true);
        });
    });
});
