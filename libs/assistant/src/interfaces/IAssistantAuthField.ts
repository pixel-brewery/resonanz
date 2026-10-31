/**
 * One native login input; submitted values never appear in progress events.
 *
 * @public
 */
export interface IAssistantAuthField {
  /**
   * Native field identifier.
   */
  readonly id: string;
  /**
   * User-facing input label.
   */
  readonly label: string;
  /**
   * Whether the settings UI must conceal the submitted value.
   */
  readonly secret: boolean;
  /**
   * Whether the native procedure requires a value.
   */
  readonly required?: boolean;
}
