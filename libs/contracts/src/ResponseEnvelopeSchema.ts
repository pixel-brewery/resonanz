// #region Imports
import { z } from 'zod';
// #endregion

/**
 * Secret-free success or failure response, preserving request correlation.
 *
 * @public
 */
export const responseEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ correlationId: z.uuid(), ok: z.literal(true), data: z.unknown() }),
  z.object({
    correlationId: z.uuid(),
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string().max(2000) }),
  }),
]);
