/**
 * Authentication procedure actually advertised by the selected native driver.
 *
 * @public
 */
export interface IAssistantAuthMethod {
  /**
   * Driver-local method identifier.
   */
  readonly id: string;
  /**
   * User-facing procedure name.
   */
  readonly label: string;
  /**
   * Interaction family; no procedure is invented by Resonanz.
   */
  readonly kind: 'browser' | 'device-code' | 'terminal' | 'credentials';
}
