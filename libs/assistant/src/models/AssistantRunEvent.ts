/**
 * Normalized, correlated native progress forwarded through the host's IPC boundary.
 *
 * @public
 */
export type AssistantRunEvent =
  | { readonly type: 'text'; readonly runId: string; readonly text: string }
  | { readonly type: 'progress'; readonly runId: string; readonly message: string }
  | { readonly type: 'continuation'; readonly runId: string; readonly value: string };
