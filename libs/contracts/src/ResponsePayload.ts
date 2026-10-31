// #region Imports
import type { z } from 'zod';
import type { RequestMethod } from './RequestMethod.js';
import type { responseSchemas } from './ResponseSchemas.js';
// #endregion

/**
 * Result inferred from its canonical method validator.
 *
 * @public
 */
export type ResponsePayload<M extends RequestMethod> = z.infer<(typeof responseSchemas)[M]>;
