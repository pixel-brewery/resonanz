// #region Imports
import type { ISessionSummary } from './ISessionSummary.js';
import type { ICollection } from './ICollection.js';
import type { ISettings } from './ISettings.js';
import type { ICapabilities } from './ICapabilities.js';
// #endregion

/**
 * Initial library data and the current native capabilities.
 *
 * @public
 */
export interface IAppSnapshot {
  readonly sessions: readonly ISessionSummary[];
  readonly collections: readonly ICollection[];
  readonly settings: ISettings;
  readonly capabilities: ICapabilities;
}
