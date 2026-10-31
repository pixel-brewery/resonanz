// #region Imports
import type { z } from 'zod';
import type { appEventSchema } from './AppEventSchema.js';
// #endregion

/**
 * Discriminated application events inferred from the shared validator.
 *
 * @public
 */
export type AppEvent = z.infer<typeof appEventSchema>;
