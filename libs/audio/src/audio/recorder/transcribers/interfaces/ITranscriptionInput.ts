export interface ITranscriptionInput {
    readonly blob: Blob;
    readonly filename?: string | null;
    readonly mimeType?: string | null;
}
