import { defaultSettings } from './DefaultSettings.js';
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
const moment = z.object({
  id: identifier,
  kind: z.enum(['decision', 'task', 'question', 'moment']),
  atMs: z.number().min(0).max(86_400_000),
  label: z.string().trim().max(500).optional(),
  origin: z.enum(['capture', 'note']).optional(),
});
const pause = z.strictObject({
  id: identifier,
  atMs: z.number().finite().min(0).max(86_400_000),
  durationMs: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
const evidence = z.object({
  segmentId: z.string().min(1).max(200),
  atMs: z.number().min(0).max(86_400_000),
  endMs: z.number().min(0).max(86_400_000),
  quote: z.string().max(40_000),
});
const claim = z.object({
  id: z.string().min(1).max(200),
  text: z.string().min(1).max(12_000),
  evidence: z.array(evidence).max(30),
  assignee: z.string().max(200).optional(),
  due: z.string().max(200).optional(),
  completed: z.boolean().optional(),
});
const analysis = z.object({
  provider: z.string().max(80),
  createdAt: timestamp,
  summary: z.array(claim).max(100),
  decisions: z.array(claim).max(100),
  tasks: z.array(claim).max(100),
  openQuestions: z.array(claim).max(100),
  topics: z
    .array(
      claim.extend({
        key: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
          .max(100),
        title: z.string().min(1).max(200),
        kind: z.enum(['decision', 'task', 'question', 'moment']),
        resolution: z.enum(['open', 'resolved']).optional(),
        evidence: z.array(evidence).min(1).max(30),
      }),
    )
    .max(100)
    .optional(),
  chapters: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        title: z.string().min(1).max(200),
        summary: z.string().max(4000),
        startMs: z.number().min(0).max(86_400_000),
        endMs: z.number().min(0).max(86_400_000),
      }),
    )
    .max(100),
});
const answer = z.object({
  kind: z.enum(['evidenced', 'gap']),
  claims: z.array(claim).max(100),
  related: z.array(evidence).max(30),
});
const message = z.object({
  id: identifier,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(250_000),
  createdAt: timestamp,
  runId: identifier.optional(),
  provider: z.string().min(1).max(80).optional(),
  state: z.enum(['complete', 'streaming', 'cancelled', 'error']),
  answer: answer.optional(),
});
const processingStep = z.object({
  state: z.enum(['pending', 'running', 'done', 'failed']),
  progress: z.number().finite().min(0).max(100).optional(),
  error: z.string().max(1000).optional(),
  provider: z.string().max(80).optional(),
  retryAt: timestamp.optional(),
});
const pipeline = z.object({
  transcription: processingStep.optional(),
  analysis: processingStep.optional(),
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
  waveform: z.array(z.number().min(0).max(1)).max(720).optional(),
  insightCounts: z
    .object({
      decisions: z.number().int().min(0),
      tasks: z.number().int().min(0),
      questions: z.number().int().min(0),
      moments: z.number().int().min(0),
      forMe: z.number().int().min(0).optional(),
    })
    .optional(),
  transcriptAvailable: z.boolean().optional(),
  pipeline: pipeline.optional(),
});
const session = sessionSummary
  .extend({
    transcript: z.array(transcriptSegment).max(20_000),
    messages: z.array(message).max(2000),
    summary: z.string().max(250_000),
    nextAudioSequence: z.number().int().min(1).max(100_001),
    audioUrl: z.string().max(300).nullable(),
    error: z.string().max(1000).optional(),
    moments: z.array(moment).max(1000).optional(),
    analysis: analysis.optional(),
    pauses: z.array(pause).max(1000).optional(),
  })
  .superRefine((session, context) => {
    const claims = [
      ...(session.analysis
        ? [
            ...session.analysis.summary,
            ...session.analysis.decisions,
            ...session.analysis.tasks,
            ...session.analysis.openQuestions,
            ...(session.analysis.topics ?? []),
          ]
        : []),
      ...session.messages.flatMap((message) => message.answer?.claims ?? []),
    ];
    const evidence = [
      ...claims.flatMap((claim) => claim.evidence),
      ...session.messages.flatMap((message) => message.answer?.related ?? []),
    ];
    for (const item of evidence) {
      const segment = session.transcript.find(
        (segment) => segment.id === item.segmentId && segment.final,
      );
      if (
        !segment ||
        item.atMs !== segment.startMs ||
        item.endMs !== segment.endMs ||
        item.quote !== segment.text
      ) {
        context.addIssue({
          code: 'custom',
          path: ['analysis'],
          message: 'Evidence does not match the saved transcript.',
        });
        break;
      }
    }
    for (const chapter of session.analysis?.chapters ?? [])
      if (
        chapter.endMs < chapter.startMs ||
        (session.durationMs > 0 && chapter.endMs > session.durationMs)
      )
        context.addIssue({
          code: 'custom',
          path: ['analysis', 'chapters'],
          message: 'A chapter lies outside the session.',
        });
  });
const collection = z.object({
  id: identifier,
  name: z.string().min(1).max(80),
  createdAt: timestamp,
});
const settings = z.object({
  appearance: z.enum(['system', 'light', 'dark']).optional(),
  userName: z.string().trim().max(200).optional(),
  addressedAs: z.string().trim().max(300).optional(),
  uiLanguage: z.enum(['en', 'de']).optional(),
  autoAnalyze: z.boolean().optional(),
  showMiniRecorder: z.boolean().optional(),
  silenceReminder: z.boolean().optional(),
  markPausesInTranscript: z.boolean().optional(),
  speechRate: z.number().finite().min(0.5).max(2).optional(),
  audioRetentionDays: z.union([z.literal('never'), z.literal(30), z.literal(90)]).optional(),
  onboardingComplete: z.boolean().optional(),
  context: z.enum(['transcript', 'transcriptAndMoments']).optional(),
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
    .default(defaultSettings.conversationInstructions),
});
const byteCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const storageUsage = z
  .strictObject({
    measuredAt: timestamp,
    audioBytes: byteCount,
    transcriptBytes: byteCount,
    analysisBytes: byteCount,
    metadataBytes: byteCount,
    totalBytes: byteCount,
    sessionCount: z.number().int().min(0).max(5000),
  })
  .refine(
    (value) =>
      value.totalBytes ===
      value.audioBytes + value.transcriptBytes + value.analysisBytes + value.metadataBytes,
    'Storage categories must sum to the measured total.',
  );
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
  moment,
  pause,
  storageUsage,
  evidence,
  claim,
  analysis,
  answer,
  message,
  sessionSummary,
  processingStep,
  pipeline,
  session,
  collection,
  settings,
  capabilities,
  assistantStatus,
  loginEvent,
} as const;
