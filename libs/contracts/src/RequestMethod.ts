// #region Imports
import type { requestSchemas } from './RequestSchemas.js';
// #endregion

/**
 * A named operation on the fixed desktop API.
 *
 * @public
 */
export type RequestMethod = keyof typeof requestSchemas;
