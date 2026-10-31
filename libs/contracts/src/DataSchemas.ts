// #region Imports
import { z } from 'zod';
// #endregion

const identifier = z.uuid();
const timestamp = z.iso.datetime();
const audioMimeType = z
  .string()
  .regex(/^audio\/(?:webm|ogg|wav|x-wav|mpeg|mp4|flac)(?:;[A-Za-z0-9=., "_-]+)?$/u)
  .max(160);
const assistantConfiguration = z.object({
  provider: z.enum(['codex', 'claude', 'opencode']),
  accountId: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/u)
    .optional(),
  executable: z.string().min(1).max(4096).optional(),
  model: z.string().max(160).optional(),
  nativeProviderId: z.string().max(160).optional(),
  nativeAuthMethod: z.string().max(160).optional(),
});
const transcriptSegment = z
  .object({
    id: z.string().min(1).max(200),
    speaker: z.enum(['participant', 'assistant']),
    text: z.string().max(40_000),
    startMs: z.number().min(0).max(86_400_000),
    endMs: z.number().min(0).max(86_400_000),
    final: z.boolean(),
  })
  .refine((value) => value.endMs >= value.startMs, 'The transcript end precedes its start.');
const message = z.object({
  id: identifier,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(250_000),
  createdAt: timestamp,
  runId: identifier.optional(),
  state: z.enum(['complete', 'streaming', 'cancelled', 'error']),
});
const sessionSummary = z.object({
  id: identifier,
  title: z.string().min(1).max(200),
  kind: z.enum(['recording', 'conversation']),
  status: z.enum(['recording', 'paused', 'ready', 'interrupted', 'processing', 'error']),
  createdAt: timestamp,
  updatedAt: timestamp,
  durationMs: z.number().min(0).max(86_400_000),
  mimeType: audioMimeType,
  audioBytes: z.number().int().min(0).max(536_870_912),
  audioAvailable: z.boolean(),
  starred: z.boolean(),
  tags: z.array(z.string().min(1).max(40)).max(24),
  collectionId: identifier.nullable(),
});
const session = sessionSummary.extend({
  transcript: z.array(transcriptSegment).max(20_000),
  messages: z.array(message).max(2000),
  summary: z.string().max(250_000),
  nextAudioSequence: z.number().int().min(1).max(100_001),
  audioUrl: z.string().max(300).nullable(),
  error: z.string().max(1000).optional(),
});
const collection = z.object({
  id: identifier,
  name: z.string().min(1).max(80),
  createdAt: timestamp,
});
const settings = z.object({
  assistant: assistantConfiguration,
  autoTranscribe: z.boolean().default(true),
  locale: z
    .string()
    .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u)
    .max(40),
  voice: z.string().trim().min(1).max(200).optional(),
  conversationInstructions: z
    .string()
    .max(12_000)
    .default(
      'Du bist Resonanz, ein aufmerksamer Gesprächspartner. Antworte auf Deutsch, klar und natürlich. Gib kurze, gut sprechbare Antworten. Behaupte keine ausgeführten Aktionen, die dir nicht bestätigt wurden.',
    ),
});
const capabilities = z.object({
  platform: z.string().max(40),
  nativeTranscription: z.boolean(),
  nativeConversation: z.boolean(),
  speechLocales: z.array(z.string().max(80)).max(500),
  speechVoices: z
    .array(
      z.object({ id: z.string().max(200), name: z.string().max(200), locale: z.string().max(80) }),
    )
    .max(1000),
  speechMessage: z.string().max(1000).optional(),
});
const assistantStatus = z.object({
  provider: z.enum(['codex', 'claude', 'opencode']),
  installed: z.boolean(),
  authenticated: z.boolean(),
  executable: z.string().optional(),
  accountLabel: z.string().optional(),
  message: z.string().optional(),
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      isDefault: z.boolean().optional(),
      reasoningEfforts: z.array(z.string()).optional(),
    }),
  ),
  authMethods: z.array(z.object({ id: z.string(), label: z.string(), kind: z.string() })),
});
const loginEvent = z.object({
  operationId: z.string(),
  state: z.enum(['starting', 'waiting', 'verifying', 'succeeded', 'failed', 'cancelled']),
  interaction: z
    .object({
      id: z.string(),
      type: z.string(),
      expiresAt: z.number().finite(),
      message: z.string().optional(),
      url: z.string().optional(),
      code: z.string().optional(),
      fields: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            secret: z.boolean(),
            required: z.boolean().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  message: z.string().optional(),
  authenticated: z.boolean().optional(),
});

/**
 * Canonical transport and persistence validators shared by every process.
 *
 * @public
 */
export const dataSchemas = {
  identifier,
  timestamp,
  assistantConfiguration,
  transcriptSegment,
  message,
  sessionSummary,
  session,
  collection,
  settings,
  capabilities,
  assistantStatus,
  loginEvent,
} as const;
