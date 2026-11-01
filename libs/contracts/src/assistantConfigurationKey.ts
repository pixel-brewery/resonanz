import type { IAssistantConfiguration } from './IAssistantConfiguration.js';

/** Canonical effective selection; an omitted account and the explicit default are the same binding. */
export function assistantConfigurationKey(configuration: IAssistantConfiguration): string {
  return JSON.stringify([
    configuration.provider,
    configuration.accountId ?? 'default',
    configuration.executable ?? '',
    configuration.model ?? '',
    configuration.nativeProviderId ?? '',
    configuration.nativeAuthMethod ?? '',
  ]);
}
