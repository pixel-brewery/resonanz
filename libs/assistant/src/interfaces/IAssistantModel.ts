/**
 * Native model metadata exposed to Resonanz without provider implementation types.
 *
 * @public
 */
export interface IAssistantModel {
  /**
   * Exact model identifier accepted by the selected CLI.
   */
  readonly id: string;
  /**
   * Native display name, when supplied.
   */
  readonly name?: string;
  /**
   * Whether native metadata marks this as its default.
   */
  readonly isDefault?: boolean;
  /**
   * Native reasoning settings, when advertised.
   */
  readonly reasoningEfforts?: readonly string[];
}
