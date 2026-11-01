import { z } from 'zod';

const version = z
  .string()
  .max(17)
  .regex(/^\d+\.\d+\.\d+$/u);
const timestamp = z.iso.datetime();
const base = {
  currentVersion: z.string().min(1).max(40),
  lastCheckedAt: timestamp.optional(),
};

/**
 * Desktop update lifecycle as Electron Main publishes it. Installer locations and checksums stay in
 * Main; the renderer only sees versions, progress and a stable failure message key.
 *
 * @public
 */
export const updateStateSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...base,
    kind: z.literal('disabled'),
    reason: z.enum(['development', 'unsupported-platform', 'not-configured']),
  }),
  z.strictObject({ ...base, kind: z.literal('idle') }),
  z.strictObject({ ...base, kind: z.literal('checking') }),
  z.strictObject({ ...base, kind: z.literal('available'), targetVersion: version }),
  z.strictObject({
    ...base,
    kind: z.literal('downloading'),
    targetVersion: version,
    progress: z.number().finite().min(0).max(1).optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('ready'),
    targetVersion: version,
    downloadedAt: timestamp,
  }),
  z.strictObject({
    ...base,
    kind: z.literal('failed'),
    code: z.enum(['CHECK_FAILED', 'DOWNLOAD_FAILED', 'INSTALL_FAILED']),
    message: z.string().min(1).max(200),
  }),
]);

/**
 * Desktop update lifecycle state.
 *
 * @public
 */
export type UpdateState = z.infer<typeof updateStateSchema>;
