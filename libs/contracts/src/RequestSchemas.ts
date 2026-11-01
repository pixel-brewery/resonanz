// #region Imports
import { z } from 'zod';
import { dataSchemas } from './DataSchemas.js';
import {
  miniRecorderActionSchema,
  miniRecorderModeSchema,
  miniRecorderSchema,
} from './MiniRecorderSchema.js';
// #endregion

const empty = z.object({}).strict();
const sessionId = z.object({ sessionId: dataSchemas.identifier });
const binary = z
  .custom<ArrayBuffer | Uint8Array>(
    (value) => value instanceof ArrayBuffer || value instanceof Uint8Array,
  )
  .refine(
    (value) => value.byteLength > 0 && value.byteLength <= 4 * 1024 * 1024,
    'Audio chunks must contain 1 byte to 4 MiB.',
  );

/**
 * Fixed request catalog. Unknown methods and extra secret fields are rejected.
 *
 * @public
 */
export const requestSchemas = {
  'bootstrap.get': empty,
  'sessions.create': z.object({
    title: z.string().trim().min(1).max(200).optional(),
    kind: z.enum(['recording', 'conversation']),
    mimeType: dataSchemas.sessionSummary.shape.mimeType,
    collectionId: dataSchemas.identifier.nullable().optional(),
  }),
  'sessions.get': sessionId,
  'sessions.search': z.object({ query: z.string().trim().max(200) }),
  'sessions.mark': sessionId.extend({ moment: dataSchemas.moment }),
  'sessions.pause': sessionId.extend({ pause: dataSchemas.pause }),
  'sessions.clear': z.strictObject({ confirm: z.literal(true) }),
  'sessions.unmark': sessionId.extend({ momentId: dataSchemas.identifier }),
  'sessions.pipeline': sessionId.extend({
    stage: z.enum(['transcription', 'analysis']),
    step: dataSchemas.processingStep.omit({ retryAt: true }).strict(),
  }),
  'sessions.retry.cancel': sessionId,
  'sessions.task': sessionId.extend({ taskId: z.string().min(1).max(200), completed: z.boolean() }),
  'sessions.waveform': sessionId.extend({
    values: dataSchemas.sessionSummary.shape.waveform.unwrap(),
  }),
  'sessions.update': sessionId.extend({
    title: z.string().trim().min(1).max(200).optional(),
    starred: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(24).optional(),
    collectionId: dataSchemas.identifier.nullable().optional(),
    status: z.enum(['recording', 'paused']).optional(),
  }),
  'sessions.delete': sessionId,
  'sessions.finish': sessionId.extend({
    durationMs: z.number().min(0).max(86_400_000),
    error: z.string().max(1000).optional(),
  }),
  'sessions.analyze': sessionId.extend({ runId: dataSchemas.identifier }),
  'sessions.ask': sessionId.extend({
    runId: dataSchemas.identifier,
    question: z.string().trim().min(1).max(12_000),
    context: z.enum(['transcript', 'transcriptAndMoments']).optional(),
  }),
  'sessions.import': empty,
  'sessions.export': sessionId.extend({ format: z.enum(['json', 'markdown', 'audio']) }),
  'collections.create': z.object({ name: z.string().trim().min(1).max(80) }),
  'collections.update': z.object({
    collectionId: dataSchemas.identifier,
    name: z.string().trim().min(1).max(80),
  }),
  'collections.delete': z.object({ collectionId: dataSchemas.identifier }),
  'audio.append': sessionId.extend({
    sequence: z.number().int().min(1).max(100_000),
    bytes: binary,
    mimeType: dataSchemas.sessionSummary.shape.mimeType,
    elapsedMs: z.number().min(0).max(86_400_000),
    channel: z.enum(['microphone', 'conversation']).optional(),
  }),
  'transcript.append': sessionId.extend({
    id: z.string().min(1).max(200).optional(),
    speaker: z.enum(['participant', 'assistant']),
    text: z.string().max(40_000),
    startMs: z.number().min(0).max(86_400_000),
    endMs: z.number().min(0).max(86_400_000),
    final: z.boolean(),
  }),
  'transcript.replace': sessionId.extend({
    segments: z.array(dataSchemas.transcriptSegment).max(20_000),
  }),
  'transcription.run': sessionId.extend({
    wavBytes: z
      .custom<ArrayBuffer | Uint8Array>(
        (value) => value instanceof ArrayBuffer || value instanceof Uint8Array,
      )
      .refine(
        (value) => value.byteLength >= 44 && value.byteLength <= 64 * 1024 * 1024,
        'Prepared WAV audio must contain 44 bytes to 64 MiB.',
      )
      .optional(),
  }),
  'assistant.status': empty,
  'assistant.test': empty,
  'assistant.detect': empty,
  'assistant.login.start': z.object({ methodId: z.string().min(1).max(160) }),
  'assistant.login.respond': z.object({
    operationId: z.string().min(1).max(200),
    interactionId: z.string().min(1).max(200),
    values: z.record(z.string().max(100), z.string().max(8192)),
  }),
  'assistant.login.cancel': z.object({ operationId: z.string().min(1).max(200) }),
  'assistant.logout': empty,
  'assistant.cancel': z.object({ runId: dataSchemas.identifier }),
  // Persistence defaults migrate older catalogs; partial edits must never reset
  // an existing opt-out or custom conversation instructions.
  'settings.save': dataSchemas.settings
    .partial()
    .extend({
      autoTranscribe: z.boolean().optional(),
      conversationInstructions: z.string().max(12_000).optional(),
    })
    .strict(),
  'speech.start': sessionId,
  'dictation.start': sessionId.extend({ operationId: dataSchemas.identifier }),
  'dictation.stop': sessionId.extend({ operationId: dataSchemas.identifier }),
  'speech.stop': sessionId,
  'speech.listen': sessionId.extend({ enabled: z.boolean() }),
  'speech.synthesize': sessionId.extend({
    speechId: dataSchemas.identifier,
    text: z.string().trim().min(1).max(4000),
    voice: z.string().trim().min(1).max(200).optional(),
  }),
  'speech.cancel': sessionId,
  'live.respond': sessionId.extend({ runId: dataSchemas.identifier }),
  'external.open': z.object({ url: z.url().max(4096) }),
  'window.show': empty,
  'window.present': z.strictObject({ surface: z.enum(['workspace', 'settings', 'onboarding']) }),
  'capture.reminder': sessionId
    .extend({ reminderId: dataSchemas.identifier, visible: z.boolean() })
    .strict(),
  'mini.update': miniRecorderSchema,
  'mini.get': empty,
  'mini.action': miniRecorderActionSchema,
  'mini.resize': z.strictObject({ mode: miniRecorderModeSchema }),
  'window.tray': empty,
  'window.tray.resize': z.strictObject({ height: z.number().int().min(1).max(4096) }),
  'storage.reveal': empty,
  'storage.usage': empty,
  'storage.cleanup': empty,
  'window.hide': empty,
  'app.quit': empty,
  'updates.get': empty,
  'updates.check': empty,
  'updates.download': empty,
  'updates.install': empty,
} as const;
