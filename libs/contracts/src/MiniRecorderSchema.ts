import { z } from 'zod';

/** Bounded presentation data for the passive floating recorder surface. */
export const miniRecorderSchema = z
  .strictObject({
    active: z.boolean(),
    sessionId: z.uuid().nullable(),
    visible: z.boolean(),
    durationMs: z.number().finite().min(0).max(86_400_000),
    level: z.number().finite().min(0).max(1),
    paused: z.boolean(),
    busy: z.boolean(),
    language: z.enum(['en', 'de']),
    appearance: z.enum(['system', 'light', 'dark']),
    feedback: z
      .strictObject({
        id: z.uuid(),
        kind: z.enum(['decision', 'task', 'question', 'moment']),
        atMs: z.number().finite().min(0).max(86_400_000),
      })
      .nullable(),
  })
  .refine((value) => value.active === (value.sessionId !== null), {
    message: 'An active mini recorder must identify its capture session.',
  });

export type IMiniRecorderSnapshot = z.infer<typeof miniRecorderSchema>;

/** Native dimensions are selected by mode, never supplied by a renderer. */
export const miniRecorderModeSchema = z.enum(['expanded', 'collapsed', 'feedback']);
export type MiniRecorderMode = z.infer<typeof miniRecorderModeSchema>;

/** An action is bound to the session shown when the user invoked it. */
export const miniRecorderActionSchema = z.strictObject({
  sessionId: z.uuid(),
  action: z.enum(['mark', 'pause', 'stop', 'open', 'undo', 'continue']),
});

export const initialMiniRecorderSnapshot: IMiniRecorderSnapshot = {
  active: false,
  sessionId: null,
  visible: false,
  durationMs: 0,
  level: 0,
  paused: false,
  busy: false,
  language: 'en',
  appearance: 'system',
  feedback: null,
};
