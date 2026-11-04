import { describe, expect, it } from 'vitest';
import {
  hostTranscriptionCommandSchema,
  hostTranscriptionEnvelopeSchema,
  hostTranscriptionResponseSchemas,
} from './HostTranscriptionSchemas.js';
import { requestEnvelopeSchema } from './RequestEnvelopeSchema.js';

const sessionId = '00000000-0000-4000-8000-000000000001';
const generation = '00000000-0000-4000-8000-000000000002';
const begin = {
  action: 'begin',
  sessionId,
  sourceHash: 'a'.repeat(64),
  locale: 'de-DE',
  plan: 'pcm16-v1',
  totalChunks: 3,
};

describe('private transcription transport', () => {
  it('bounds the native plan and rejects unversioned or foreign command fields', () => {
    expect(hostTranscriptionCommandSchema.parse(begin)).toEqual(begin);
    for (const changes of [
      { totalChunks: 0 },
      { totalChunks: 3001 },
      { totalChunks: 1.5 },
      { sourceHash: '../recording' },
      { plan: 'unknown' },
      { locale: '' },
      { path: '/untrusted.wav' },
    ])
      expect(hostTranscriptionCommandSchema.safeParse({ ...begin, ...changes }).success).toBe(
        false,
      );
    expect(
      hostTranscriptionCommandSchema.safeParse({
        action: 'chunk',
        sessionId,
        generation,
        index: 0,
        segments: [],
      }).success,
    ).toBe(true);
    expect(
      hostTranscriptionCommandSchema.safeParse({
        action: 'cancel',
        sessionId,
        generation: 'stale',
      }).success,
    ).toBe(false);
  });

  it('keeps checkpoint commands outside the public renderer catalog and validates begin results', () => {
    expect(
      hostTranscriptionEnvelopeSchema.safeParse({
        type: 'host.transcription',
        correlationId: generation,
        command: begin,
      }).success,
    ).toBe(true);
    expect(
      requestEnvelopeSchema.safeParse({
        correlationId: generation,
        method: 'host.transcription',
        payload: begin,
      }).success,
    ).toBe(false);
    expect(
      hostTranscriptionResponseSchemas.begin.safeParse({ generation, nextChunk: -1 }).success,
    ).toBe(false);
    expect(
      hostTranscriptionResponseSchemas.begin.safeParse({ generation, nextChunk: 3001 }).success,
    ).toBe(false);
  });
});
