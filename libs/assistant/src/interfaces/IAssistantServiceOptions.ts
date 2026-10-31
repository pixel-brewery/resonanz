/**
 * Captured bootstrap configuration for the utility-process assistant owner.
 *
 * @public
 */
export interface IAssistantServiceOptions {
  /**
   * Absolute, account-private application data directory chosen by the desktop host.
   */
  readonly userDataDirectory: string;
  /**
   * Host environment captured at bootstrap; only toolchain/network locale keys are forwarded.
   */
  readonly environment: Readonly<Record<string, string | undefined>>;
}
