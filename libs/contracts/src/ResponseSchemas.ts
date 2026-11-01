// #region Imports
import { z } from 'zod';
import { dataSchemas } from './DataSchemas.js';
import { miniRecorderSchema } from './MiniRecorderSchema.js';
// #endregion

const done = z.object({ ok: z.literal(true) });

/**
 * Validates results before they cross into the renderer.
 *
 * @public
 */
export const responseSchemas = {
  'bootstrap.get': z.object({
    sessions: z.array(dataSchemas.sessionSummary),
    collections: z.array(dataSchemas.collection),
    settings: dataSchemas.settings,
    capabilities: dataSchemas.capabilities,
  }),
  'sessions.create': dataSchemas.session,
  'sessions.get': dataSchemas.session,
  'sessions.search': z.array(dataSchemas.identifier).max(5000),
  'sessions.mark': dataSchemas.session,
  'sessions.pause': dataSchemas.session,
  'sessions.clear': z.strictObject({ deletedSessionCount: z.number().int().min(0).max(5000) }),
  'sessions.unmark': dataSchemas.session,
  'sessions.pipeline': dataSchemas.session,
  'sessions.retry.cancel': dataSchemas.session,
  'sessions.task': dataSchemas.session,
  'sessions.waveform': dataSchemas.session,
  'sessions.update': dataSchemas.session,
  'sessions.delete': done,
  'sessions.finish': dataSchemas.session,
  'sessions.analyze': z.object({ runId: dataSchemas.identifier }),
  'sessions.ask': z.object({ runId: dataSchemas.identifier }),
  'sessions.import': dataSchemas.session.nullable(),
  'sessions.export': z.object({ saved: z.boolean() }),
  'collections.create': dataSchemas.collection,
  'collections.update': dataSchemas.collection,
  'collections.delete': done,
  'audio.append': z.object({
    sequence: z.number().int().min(0),
    totalBytes: z.number().int().min(0),
  }),
  'transcript.append': dataSchemas.session,
  'transcript.replace': dataSchemas.session,
  'transcription.run': dataSchemas.session,
  'assistant.status': dataSchemas.assistantStatus,
  'assistant.test': z.object({ text: z.string().max(4000), latencyMs: z.number().min(0) }),
  'assistant.detect': z.array(
    z
      .object({
        provider: z.string(),
        installed: z.boolean(),
        executable: z.string().optional(),
        version: z.string().optional(),
        message: z.string().optional(),
      })
      .passthrough(),
  ),
  'assistant.login.start': z.object({ operationId: z.string() }),
  'assistant.login.respond': done,
  'assistant.login.cancel': done,
  'assistant.logout': done,
  'assistant.cancel': done,
  'settings.save': dataSchemas.settings,
  'speech.start': z.object({ started: z.literal(true) }),
  'dictation.start': z.object({ started: z.literal(true) }),
  'dictation.stop': z.object({ stopped: z.literal(true) }),
  'speech.stop': z.object({ stopped: z.literal(true) }),
  'speech.listen': z.object({ listening: z.boolean() }),
  'speech.synthesize': z.object({ audioUrl: z.string().max(400) }),
  'speech.cancel': z.object({ cancelled: z.literal(true) }),
  'live.respond': z.object({ runId: dataSchemas.identifier }),
  'external.open': done,
  'window.show': done,
  'window.present': done,
  'capture.reminder': done,
  'mini.update': done,
  'mini.get': miniRecorderSchema,
  'mini.action': done,
  'mini.resize': done,
  'window.tray': done,
  'window.tray.resize': done,
  'storage.reveal': done,
  'storage.usage': dataSchemas.storageUsage,
  'storage.cleanup': z.strictObject({
    removedAudioCount: z.number().int().min(0).max(5000),
    freedBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }),
  'window.hide': done,
  'app.quit': done,
} as const;
