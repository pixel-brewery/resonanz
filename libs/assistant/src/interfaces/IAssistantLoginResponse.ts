/**
 * Response to the current, correlated native authentication interaction.
 *
 * @public
 */
export interface IAssistantLoginResponse {
  /**
   * Resonanz operation ID returned by `startLogin`.
   */
  readonly operationId: string;
  /**
   * Exact currently waiting native interaction identifier.
   */
  readonly interactionId: string;
  /**
   * Native requested input values; never logged or persisted by this adapter.
   */
  readonly values: Readonly<Record<string, string>>;
}
