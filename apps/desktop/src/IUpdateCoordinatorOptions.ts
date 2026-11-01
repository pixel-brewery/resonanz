// #region Imports
import type { IInstallerUpdateAdapter } from './IInstallerUpdateAdapter.js';
// #endregion

/**
 * Runtime facts and collaborators of the desktop update coordinator.
 *
 * @public
 */
export interface IUpdateCoordinatorOptions {
  readonly installerAdapter: IInstallerUpdateAdapter;
  /** Version of the running application (`app.getVersion()`). */
  readonly currentVersion: string;
  /**
   * HTTPS directory that holds one `update-<platform>-<architecture>.json` manifest per target.
   * An empty value disables updates.
   */
  readonly feedUrl: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  /** Development builds never check for updates. */
  readonly packaged: boolean;
  /** Quits Resonanz once the downloaded installer is open, so it can replace the application. */
  readonly quitApplication: () => void;
  readonly now?: () => Date;
}
