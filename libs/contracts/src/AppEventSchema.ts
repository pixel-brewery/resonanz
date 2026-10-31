// #region Imports
import { z } from 'zod';
import { dataSchemas } from './DataSchemas.js';
// #endregion

/**
 * Push events validate at the publisher and sandboxed preload boundary.
 *
 * @public
 */
export const appEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('library.changed') }),
  z.object({
    type: z.literal('ui.command'),
    command: z.enum(['recording.start', 'conversation.start', 'recording.stop']),
  }),
  z.object({ type: z.literal('session.updated'), sessionId: dataSchemas.identifier }),
  z.object({
    type: z.literal('assistant.text'),
    sessionId: dataSchemas.identifier,
    runId: dataSchemas.identifier,
    text: z.string().max(250_000),
  }),
  z.object({
    type: z.literal('assistant.progress'),
    sessionId: dataSchemas.identifier,
    runId: dataSchemas.identifier,
    message: z.string().max(2000),
  }),
  z.object({
    type: z.literal('assistant.completed'),
    sessionId: dataSchemas.identifier,
    runId: dataSchemas.identifier,
    kind: z.enum(['analysis', 'question', 'conversation']),
  }),
  z.object({
    type: z.literal('assistant.failed'),
    sessionId: dataSchemas.identifier,
    runId: dataSchemas.identifier,
    message: z.string().max(2000),
    cancelled: z.boolean(),
  }),
  z.object({
    type: z.literal('speech.result'),
    sessionId: dataSchemas.identifier,
    id: dataSchemas.identifier,
    text: z.string().max(40_000),
    final: z.boolean(),
    startMs: z.number().min(0).max(86_400_000),
    endMs: z.number().min(0).max(86_400_000),
  }),
  z.object({
    type: z.literal('speech.error'),
    sessionId: dataSchemas.identifier,
    message: z.string().max(2000),
  }),
  z.object({ type: z.literal('assistant.login'), event: dataSchemas.loginEvent }),
  z.object({
    type: z.literal('runtime.status'),
    state: z.enum(['starting', 'ready', 'restarting', 'stopped']),
    message: z.string().optional(),
  }),
]);
