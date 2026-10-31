// #region Imports
import type { z } from 'zod';
import type { RequestMethod } from './RequestMethod.js';
import type { requestSchemas } from './RequestSchemas.js';
// #endregion

/**
 * Input inferred from its canonical method validator.
 *
 * @public
 */
export type RequestPayload<M extends RequestMethod> = z.infer<(typeof requestSchemas)[M]>;
