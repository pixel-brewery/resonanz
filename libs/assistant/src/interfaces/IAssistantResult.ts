/**
 * Final text and account-bound continuation from the same native invocation.
 *
 * @public
 */
export interface IAssistantResult {
  /**
   * Complete final answer, not an additional text delta.
   */
  readonly text: string;
  /**
   * Opaque full continuation reference suitable for application persistence.
   */
  readonly continuation?: string;
}
