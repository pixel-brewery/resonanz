import { z } from 'zod';
import { dataSchemas } from './DataSchemas.js';

const sessionId = dataSchemas.identifier;
const generation = z.uuid();

/** Main-to-Utility commands; deliberately absent from the renderer method catalog. */
export const hostTranscriptionCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('begin'),
    sessionId,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    locale: z.string().trim().min(1).max(80),
    plan: z.literal('pcm16-v1'),
    totalChunks: z.number().int().min(1).max(3000),
  }),
  z.strictObject({
    action: z.literal('chunk'),
    sessionId,
    generation,
    index: z.number().int().min(0).max(2999),
    segments: z.array(dataSchemas.transcriptSegment).max(1000),
  }),
  z.strictObject({ action: z.literal('complete'), sessionId, generation }),
  z.strictObject({ action: z.literal('cancel'), sessionId, generation }),
]);

export type HostTranscriptionCommand = z.infer<typeof hostTranscriptionCommandSchema>;

/** Each command validates its correlated result independently at both process boundaries. */
export const hostTranscriptionResponseSchemas = {
  begin: z.strictObject({ generation, nextChunk: z.number().int().min(0).max(3000) }),
  chunk: dataSchemas.session,
  complete: dataSchemas.session,
  cancel: dataSchemas.session,
} as const;

export type HostTranscriptionResult<A extends HostTranscriptionCommand['action']> = z.infer<
  (typeof hostTranscriptionResponseSchemas)[A]
>;

/** This envelope travels on the parent port and is never accepted by the public preload. */
export const hostTranscriptionEnvelopeSchema = z.strictObject({
  type: z.literal('host.transcription'),
  correlationId: z.uuid(),
  command: hostTranscriptionCommandSchema,
});
