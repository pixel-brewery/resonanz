// #region Imports
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, maxLength, pattern, required } from '@angular/forms/signals';
import type {
  AppEvent,
  IAssistantConfiguration,
  ISettings,
  ResponsePayload,
} from '@resonanz/contracts';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { CapturePresenter } from './CapturePresenter';
import type { ISettingsFormModel } from './ISettingsFormModel';
// #endregion

type LoginEvent = Extract<AppEvent, { type: 'assistant.login' }>['event'];

function editable(settings: ISettings): ISettingsFormModel {
  return {
    provider: settings.assistant.provider,
    accountId: settings.assistant.accountId ?? 'default',
    executable: settings.assistant.executable ?? '',
    model: settings.assistant.model ?? '',
    nativeProviderId: settings.assistant.nativeProviderId ?? '',
    nativeAuthMethod: settings.assistant.nativeAuthMethod ?? '',
    locale: settings.locale,
    autoTranscribe: settings.autoTranscribe,
    voice: settings.voice ?? '',
    conversationInstructions: settings.conversationInstructions,
  };
}

function assistantSelection(model: ISettingsFormModel): IAssistantConfiguration {
  return {
    provider: model.provider,
    accountId: model.accountId.trim(),
    ...(model.model.trim() ? { model: model.model.trim() } : {}),
    ...(model.executable.trim() ? { executable: model.executable.trim() } : {}),
    ...(model.nativeProviderId.trim() ? { nativeProviderId: model.nativeProviderId.trim() } : {}),
    ...(model.nativeAuthMethod.trim() ? { nativeAuthMethod: model.nativeAuthMethod.trim() } : {}),
  };
}

function bindingKey(configuration: IAssistantConfiguration): string {
  return JSON.stringify([
    configuration.provider,
    configuration.accountId ?? 'default',
    configuration.executable ?? '',
    configuration.model ?? '',
    configuration.nativeProviderId ?? '',
    configuration.nativeAuthMethod ?? '',
  ]);
}

function isAccountInteraction(interaction: NonNullable<LoginEvent['interaction']>): boolean {
  if (interaction.type !== 'browser' && interaction.type !== 'device-code') return false;
  return (
    !interaction.fields?.length ||
    (interaction.type === 'browser' &&
      interaction.fields.every((field) => field.id === 'authorizationCode'))
  );
}

/** Owns explicit local-account authentication and native speech preferences. */
@Injectable()
export class SettingsPresenter {
  // #region Fields
  private readonly _api = inject(DesktopApi);
  private readonly _model = signal<ISettingsFormModel>(editable(inject(LibraryStore).settings()));
  private readonly _loginFields = signal<Record<string, string>>({});
  private readonly _earlyLoginEvents = new Map<string, LoginEvent>();
  private readonly _ignoredOperations = new Set<string>();
  private _interactionId: string | null = null;
  private _observedBinding = bindingKey(assistantSelection(this._model()));
  private _statusBinding: string | null = null;
  private _statusVersion = 0;
  private _loginVersion = 0;
  private _loginBinding: string | null = null;
  private _activeOperationId: string | null = null;
  private _pendingLogin: { readonly version: number; readonly binding: string } | null = null;
  private _loginCancellation: Promise<void> = Promise.resolve();
  private _destroyed = false;
  public readonly library = inject(LibraryStore);
  public readonly capture = inject(CapturePresenter);
  public readonly saving = signal(false);
  public readonly checking = signal(false);
  public readonly saved = signal(false);
  public readonly status = signal<ResponsePayload<'assistant.status'> | null>(null);
  public readonly authMethods = computed(() =>
    (this.status()?.authMethods ?? []).filter(
      (method) => method.kind === 'browser' || method.kind === 'device-code',
    ),
  );
  public readonly login = signal<LoginEvent | null>(null);
  public readonly form = form(this._model, (schema) => {
    required(schema.accountId);
    maxLength(schema.accountId, 80);
    pattern(schema.accountId, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/u);
    maxLength(schema.model, 160);
    maxLength(schema.executable, 4096);
    required(schema.locale);
    maxLength(schema.locale, 40);
    maxLength(schema.voice, 200);
    maxLength(schema.conversationInstructions, 12_000);
  });
  public readonly loginForm = form(this._loginFields);
  // #endregion

  // #region Ctor
  /** Correlates native events and invalidates observations when the editable account changes. */
  public constructor() {
    this.library.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'assistant.login') this.receiveLogin(event.event);
    });
    effect(() => {
      const binding = bindingKey(assistantSelection(this._model()));
      untracked(() => this.observeBinding(binding));
    });
    inject(DestroyRef).onDestroy(() => {
      this._destroyed = true;
      this.invalidateStatus();
      void this.detachLogin().catch(() => undefined);
    });
  }
  // #endregion

  // #region Methods
  /** Loads persisted choices and performs a bounded, read-only connection check. */
  public async initialize(): Promise<void> {
    await this.library.refresh();
    if (this._destroyed) return;
    this._model.set(editable(this.library.settings()));
    this.synchronizeBinding();
    await this.refreshStatus();
  }

  /** Saves validated non-secret settings and refreshes the method catalog for the saved binding. */
  public async save(): Promise<boolean> {
    this.synchronizeBinding();
    if (this.form().invalid() || this.saving() || this._destroyed) return false;
    this.saving.set(true);
    this.saved.set(false);
    this.library.clearError();
    const model = { ...this._model() };
    const assistant = assistantSelection(model);
    const binding = bindingKey(assistant);
    try {
      if (binding !== bindingKey(this.library.settings().assistant)) await this.detachLogin();
      if (this._destroyed || binding !== this.currentBinding()) return false;
      await this.library.saveSettings({
        assistant,
        locale: model.locale.trim(),
        autoTranscribe: model.autoTranscribe,
        voice: model.voice.trim() || undefined,
        conversationInstructions: model.conversationInstructions,
      });
      this.invalidateStatus();
      if (this._destroyed || binding !== this.currentBinding()) return false;
      await this.refreshStatus();
      if (this._destroyed || binding !== this.currentBinding()) return false;
      this.saved.set(true);
      return true;
    } catch (error) {
      if (!this._destroyed) this.library.report(error);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** Saves the edited selection before checking that exact native account. */
  public async saveAndCheck(): Promise<void> {
    await this.save();
  }

  /** Queries the persisted account without allowing an older response to replace newer selection state. */
  public async refreshStatus(): Promise<void> {
    const binding = this.synchronizeBinding();
    this.invalidateStatus();
    if (this._destroyed || binding !== bindingKey(this.library.settings().assistant)) return;
    const version = this._statusVersion;
    this.checking.set(true);
    try {
      const status = await this._api.request('assistant.status', {});
      if (this.isCurrentStatus(version, binding)) {
        this._statusBinding = binding;
        this.status.set(status);
      }
    } catch (error) {
      if (this.isCurrentStatus(version, binding)) this.library.report(error);
    } finally {
      if (version === this._statusVersion) this.checking.set(false);
    }
  }

  /** Starts only a freshly advertised method belonging to the exact saved provider/account. */
  public async connect(methodId: string): Promise<void> {
    if (!(await this.save())) return;
    const binding = this.currentBinding();
    if (
      this._statusBinding !== binding ||
      !this.authMethods().some((method) => method.id === methodId)
    ) {
      this.library.report(
        new Error(
          'Bitte eine der aktuell angebotenen Browser- oder Geräteanmeldungen für diesen Assistenten wählen.',
        ),
      );
      return;
    }
    try {
      await this.detachLogin();
      if (
        this._destroyed ||
        binding !== this.currentBinding() ||
        binding !== bindingKey(this.library.settings().assistant)
      )
        return;
      const version = ++this._loginVersion;
      this._pendingLogin = { version, binding };
      this.saving.set(true);
      const operation = await this._api.request('assistant.login.start', { methodId });
      if (
        this._destroyed ||
        this._pendingLogin?.version !== version ||
        binding !== this.currentBinding() ||
        binding !== bindingKey(this.library.settings().assistant)
      ) {
        await this.queueCancellation(operation.operationId);
        return;
      }
      this._pendingLogin = null;
      this._activeOperationId = operation.operationId;
      this._loginBinding = binding;
      const early = this._earlyLoginEvents.get(operation.operationId);
      this._earlyLoginEvents.clear();
      this.acceptLogin(early ?? { operationId: operation.operationId, state: 'starting' });
    } catch (error) {
      this._pendingLogin = null;
      if (!this._destroyed) this.library.report(error);
    } finally {
      this.saving.set(false);
    }
  }

  /** Sends inputs only to the current account's exact operation and interaction, then clears them. */
  public async respondLogin(): Promise<void> {
    this.synchronizeBinding();
    const login = this.login();
    const interaction = login?.interaction;
    if (
      !login ||
      !interaction ||
      login.operationId !== this._activeOperationId ||
      this._loginBinding !== this.currentBinding() ||
      !isAccountInteraction(interaction) ||
      !interaction.fields?.length
    )
      return;
    try {
      await this._api.request('assistant.login.respond', {
        operationId: login.operationId,
        interactionId: interaction.id,
        values: { ...this._loginFields() },
      });
      if (this._interactionId === interaction.id)
        this._loginFields.set(
          Object.fromEntries((interaction.fields ?? []).map((field) => [field.id, ''])),
        );
    } catch (error) {
      if (!this._destroyed) this.library.report(error);
    }
  }

  /** Cancels the owned native flow; a pending start is cancelled as soon as its operation ID arrives. */
  public async cancelLogin(): Promise<void> {
    await this.detachLogin().catch(() => undefined);
    if (!this._destroyed) await this.refreshStatus();
  }

  /** Opens only the current account's correlated native authentication URL after a click. */
  public async openLogin(): Promise<void> {
    this.synchronizeBinding();
    const login = this.login();
    const url = login?.interaction?.url;
    if (
      !url ||
      login.operationId !== this._activeOperationId ||
      this._loginBinding !== this.currentBinding()
    )
      return;
    try {
      await this._api.request('external.open', { url });
    } catch (error) {
      if (!this._destroyed) this.library.report(error);
    }
  }

  /** Saves the selected account, cancels its old login and explicitly signs out that account only. */
  public async logout(): Promise<void> {
    if (!(await this.save())) return;
    try {
      await this.detachLogin();
      await this._api.request('assistant.logout', {});
      await this.refreshStatus();
    } catch (error) {
      if (!this._destroyed) this.library.report(error);
    }
  }

  private currentBinding(): string {
    return bindingKey(assistantSelection(this._model()));
  }

  private synchronizeBinding(): string {
    const binding = this.currentBinding();
    this.observeBinding(binding);
    return binding;
  }

  private observeBinding(binding: string): void {
    if (binding === this._observedBinding) return;
    this._observedBinding = binding;
    this.saved.set(false);
    this.invalidateStatus();
    void this.detachLogin().catch(() => undefined);
  }

  private invalidateStatus(): void {
    this._statusVersion += 1;
    this._statusBinding = null;
    this.status.set(null);
    this.checking.set(false);
  }

  private isCurrentStatus(version: number, binding: string): boolean {
    return (
      !this._destroyed &&
      version === this._statusVersion &&
      binding === this.currentBinding() &&
      binding === bindingKey(this.library.settings().assistant)
    );
  }

  private receiveLogin(event: LoginEvent): void {
    this.synchronizeBinding();
    if (this._destroyed || this._ignoredOperations.has(event.operationId)) return;
    if (this._pendingLogin !== null) {
      this._earlyLoginEvents.set(event.operationId, event);
      if (this._earlyLoginEvents.size > 8) {
        const oldest = this._earlyLoginEvents.keys().next().value;
        if (oldest !== undefined) this._earlyLoginEvents.delete(oldest);
      }
      return;
    }
    if (
      event.operationId !== this._activeOperationId ||
      this._loginBinding !== this.currentBinding() ||
      this._loginBinding !== bindingKey(this.library.settings().assistant)
    )
      return;
    this.acceptLogin(event);
  }

  private acceptLogin(event: LoginEvent): void {
    if (event.interaction && !isAccountInteraction(event.interaction)) {
      this._activeOperationId = null;
      this._loginBinding = null;
      this._interactionId = null;
      this._loginFields.set({});
      this.login.set({
        operationId: event.operationId,
        state: 'failed',
        message:
          'Diese Methode verlangt manuelle Zugangsdaten. Bitte die Kontoanmeldung im Browser oder per Gerätecode verwenden.',
      });
      void this.queueCancellation(event.operationId)
        .catch(() => undefined)
        .then(() => this.refreshStatus());
      return;
    }
    this.login.set(event);
    const interaction = event.interaction;
    if (interaction && interaction.id !== this._interactionId) {
      this._interactionId = interaction.id;
      this._loginFields.set(
        Object.fromEntries((interaction.fields ?? []).map((field) => [field.id, ''])),
      );
    }
    if (['succeeded', 'failed', 'cancelled'].includes(event.state)) {
      this.ignoreOperation(event.operationId);
      this._activeOperationId = null;
      this._loginBinding = null;
      this._interactionId = null;
      this._loginFields.set({});
      void this.refreshStatus();
    }
  }

  private detachLogin(): Promise<void> {
    this._loginVersion += 1;
    this._pendingLogin = null;
    this._earlyLoginEvents.clear();
    const operationId = this._activeOperationId;
    this._activeOperationId = null;
    this._loginBinding = null;
    this._interactionId = null;
    this.login.set(null);
    this._loginFields.set({});
    if (operationId) return this.queueCancellation(operationId);
    return this._loginCancellation;
  }

  private queueCancellation(operationId: string): Promise<void> {
    this.ignoreOperation(operationId);
    const work = this._loginCancellation.then(async () => {
      await this._api.request('assistant.login.cancel', { operationId });
    });
    this._loginCancellation = work.catch((error: unknown) => {
      if (!this._destroyed) this.library.report(error);
    });
    return work;
  }

  private ignoreOperation(operationId: string): void {
    this._ignoredOperations.add(operationId);
    if (this._ignoredOperations.size > 32) {
      const oldest = this._ignoredOperations.values().next().value;
      if (oldest !== undefined) this._ignoredOperations.delete(oldest);
    }
  }
  // #endregion
}
