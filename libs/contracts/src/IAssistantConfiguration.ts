/**
 * Host-owned selection of a Synapse CLI provider and account.
 *
 * @public
 */
export interface IAssistantConfiguration {
  readonly provider: 'codex' | 'claude' | 'opencode';
  readonly accountId?: string;
  readonly executable?: string;
  readonly model?: string;
  readonly nativeProviderId?: string;
  readonly nativeAuthMethod?: string;
}
