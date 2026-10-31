// #region Imports
import { z } from 'zod';
import { requestSchemas } from './RequestSchemas.js';
import type { RequestMethod } from './RequestMethod.js';
// #endregion

/**
 * Correlated request envelope validated independently in each process.
 *
 * @public
 */
export const requestEnvelopeSchema = z
  .object({
    correlationId: z.uuid(),
    method: z.enum(Object.keys(requestSchemas) as [RequestMethod, ...RequestMethod[]]),
    payload: z.unknown(),
  })
  .strict();
