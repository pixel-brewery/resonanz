// #region Imports
import { z } from 'zod';
// #endregion

/**
 * Private Utility-to-Main process ownership notices; no command, environment or credential data crosses.
 *
 * @public
 */
export const ownedProcessMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('process.spawned'),
      token: z.uuid(),
      pid: z.number().int().min(1).max(0xffff_ffff),
      detached: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('process.closed'),
      token: z.uuid(),
      pid: z.number().int().min(1).max(0xffff_ffff),
    })
    .strict(),
]);
