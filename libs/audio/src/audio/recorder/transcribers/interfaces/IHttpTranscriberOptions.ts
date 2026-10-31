export interface IHttpTranscriberOptions {
    readonly url: string;
    readonly method?: 'POST' | 'PUT';
    readonly fieldName?: string;
    readonly headers?: Record<string, string>;
    readonly extraFields?: Record<string, string>;
}
