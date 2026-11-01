import { translate, uiLanguage } from '@resonanz/intl';
// #region Imports
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, max, maxLength, min, pattern, required } from '@angular/forms/signals';
import { assistantConfigurationKey as bindingKey } from '@resonanz/contracts';
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
    uiLanguage: settings.uiLanguage ?? 'en',
    locale: settings.locale,
    autoTranscribe: settings.autoTranscribe,
    voice: settings.voice ?? 'default',
    conversationInstructions: settings.conversationInstructions,
    appearance: settings.appearance ?? 'system',
    userName: settings.userName ?? '',
    addressedAs: settings.addressedAs ?? '',
    autoAnalyze: settings.autoAnalyze ?? false,
    showMiniRecorder: settings.showMiniRecorder ?? false,
    silenceReminder: settings.silenceReminder ?? false,
    markPausesInTranscript: settings.markPausesInTranscript ?? false,
    speechRate: settings.speechRate ?? 1,
    audioRetentionDays: String(
      settings.audioRetentionDays ?? 'never',
    ) as ISettingsFormModel['audioRetentionDays'],
    context: settings.context ?? 'transcriptAndMoments',
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

function settingsPatch(model: ISettingsFormModel): Partial<ISettings> {
  return {
    assistant: assistantSelection(model),
    uiLanguage: model.uiLanguage,
    locale: model.locale.trim(),
    autoTranscribe: model.autoTranscribe,
    voice: model.voice.trim() === 'default' ? undefined : model.voice.trim() || undefined,
    conversationInstructions: model.conversationInstructions,
    appearance: model.appearance,
    userName: model.userName,
    addressedAs: model.addressedAs,
    autoAnalyze: model.autoAnalyze,
    showMiniRecorder: model.showMiniRecorder,
    silenceReminder: model.silenceReminder,
    markPausesInTranscript: model.markPausesInTranscript,
    speechRate: model.speechRate,
    audioRetentionDays:
      model.audioRetentionDays === 'never'
        ? 'never'
        : (Number(model.audioRetentionDays) as 30 | 90),
    context: model.context,
  };
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
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _savedModel = '';
  private readonly _autosave = signal(false);
  public readonly library = inject(LibraryStore);
  public readonly capture = inject(CapturePresenter);
  public readonly saving = signal(false);
  public readonly checking = signal(false);
  public readonly saved = signal(false);
  public readonly testing = signal(false);
  public readonly confirmingClear = signal(false);
  public readonly clearingLibrary = signal(false);
  public readonly clearBlockedReason = computed(() =>
    this.capture.active() ||
    this.library
      .sessions()
      .some(
        (session) =>
          session.status === 'recording' ||
          session.status === 'paused' ||
          session.status === 'processing' ||
          session.pipeline?.transcription?.state === 'running' ||
          session.pipeline?.analysis?.state === 'running',
      )
      ? 'loc.resonanz.error.libraryBusy'
      : '',
  );
  private readonly _speechRates = [0.5, 0.75, 1, 1.5, 2] as const;
  public readonly speechRateIndex = computed(() => {
    const rate = this._model().speechRate;
    return this._speechRates.reduce<number>(
      (closest, candidate, index) =>
        Math.abs(candidate - rate) < Math.abs(this._speechRates[closest]! - rate) ? index : closest,
      0,
    );
  });
  private readonly _testLatencyMs = signal<number | null>(null);
  public readonly testResult = computed(() => {
    const latency = this._testLatencyMs();
    const language = uiLanguage(this.library.settings().uiLanguage);
    return latency === null
      ? null
      : translate(
          language,
          'loc.resonanz.settings.testSuccess',
          new Intl.NumberFormat(language, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(latency / 1000),
        );
  });
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
    maxLength(schema.userName, 200);
    maxLength(schema.addressedAs, 300);
    min(schema.speechRate, 0.5);
    max(schema.speechRate, 2);
    pattern(schema.audioRetentionDays, /^(?:never|30|90)$/u);
  });
  public readonly loginForm = form(this._loginFields);
  // #endregion

  // #region Ctor
  /** Correlates native events and invalidates observations when the editable account changes. */
  public constructor() {
    effect(() => {
      const language = this._model().uiLanguage;
      if (!this._autosave() || language === (this.library.settings().uiLanguage ?? 'en')) return;
      void untracked(() => this.library.saveSettings({ uiLanguage: language })).catch((error) =>
        this.library.report(error),
      );
    });
    effect(() => {
      const model = JSON.stringify(this._model());
      const enabled = this._autosave();
      const capturing = this.capture.active();
      if (this._saveTimer) clearTimeout(this._saveTimer);
      if (!enabled || capturing || model === this._savedModel) return;
      this.saved.set(false);
      this._saveTimer = setTimeout(() => {
        void this.save();
      }, 550);
    });
    this.library.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'assistant.login') this.receiveLogin(event.event);
    });
    effect(() => {
      const binding = bindingKey(assistantSelection(this._model()));
      untracked(() => this.observeBinding(binding));
    });
    inject(DestroyRef).onDestroy(() => {
      if (
        this._autosave() &&
        !this.capture.active() &&
        !this.form().invalid() &&
        JSON.stringify(this._model()) !== this._savedModel
      )
        void this.library
          .saveSettings(settingsPatch(this._model()))
          .catch((error) => this.library.report(error));
      this._destroyed = true;
      if (this._saveTimer) clearTimeout(this._saveTimer);
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
  /** Enables immediate, debounced persistence after the actual initial settings have loaded. */
  public enableAutosave(): void {
    this._savedModel = JSON.stringify(this._model());
    this._autosave.set(true);
  }
  /** Maps the five visual positions to native pacing without rewriting an untouched custom rate. */
  public setSpeechRateIndex(index: number): void {
    if (this.capture.active() || !Number.isInteger(index) || index === this.speechRateIndex())
      return;
    const rate = this._speechRates[index];
    if (rate !== undefined) this.form.speechRate().value.set(rate);
  }

  /** Opens the explicit confirmation only while no recording or processing owns the library. */
  public requestClearLibrary(): void {
    if (!this.clearingLibrary() && !this.clearBlockedReason()) this.confirmingClear.set(true);
  }

  public cancelClearLibrary(): void {
    if (!this.clearingLibrary()) this.confirmingClear.set(false);
  }

  /** Deletes only library sessions/collections after the reviewable in-app confirmation. */
  public async clearLibrary(): Promise<void> {
    if (!this.confirmingClear() || this.clearingLibrary() || this.clearBlockedReason()) return;
    this.clearingLibrary.set(true);
    try {
      await this._api.request('sessions.clear', { confirm: true });
      await Promise.all([this.library.refresh(), this.library.refreshStorage()]);
      if (!this._destroyed) this.confirmingClear.set(false);
    } catch (error) {
      if (!this._destroyed) this.library.report(error);
    } finally {
      this.clearingLibrary.set(false);
    }
  }
  public selectProvider(provider: 'codex' | 'claude'): void {
    if (this._model().provider === provider) return;
    this._model.update((model) => ({
      ...model,
      provider,
      model: '',
      executable: '',
      nativeAuthMethod: '',
      nativeProviderId: '',
    }));
    void this.save();
  }
  public async testAssistant(): Promise<void> {
    if (this.testing() || !(await this.save())) return;
    const binding = this.currentBinding();
    this.testing.set(true);
    this._testLatencyMs.set(null);
    try {
      const result = await this._api.request('assistant.test', {});
      if (!this._destroyed && binding === this.currentBinding())
        this._testLatencyMs.set(result.latencyMs);
    } catch (error) {
      if (!this._destroyed && binding === this.currentBinding()) this.library.report(error);
    } finally {
      if (!this._destroyed) this.testing.set(false);
    }
  }

  /** Saves validated non-secret settings and refreshes the method catalog for the saved binding. */
  public async save(): Promise<boolean> {
    this.synchronizeBinding();
    if (this.form().invalid() || this.saving() || this.capture.active() || this._destroyed)
      return false;
    this.saving.set(true);
    this.saved.set(false);
    const model = { ...this._model() };
    const assistant = assistantSelection(model);
    const binding = bindingKey(assistant);
    const retentionChanged =
      model.audioRetentionDays !== String(this.library.settings().audioRetentionDays ?? 'never');
    try {
      if (binding !== bindingKey(this.library.settings().assistant)) await this.detachLogin();
      if (this._destroyed || binding !== this.currentBinding()) return false;
      await this.library.saveSettings(settingsPatch(model));
      if (retentionChanged) {
        await this._api.request('storage.cleanup', {});
        await Promise.all([this.library.refresh(), this.library.refreshStorage()]);
      }
      this.invalidateStatus();
      if (this._destroyed || binding !== this.currentBinding()) return false;
      await this.refreshStatus();
      if (this._destroyed || binding !== this.currentBinding()) return false;
      this.saved.set(true);
      this._savedModel = JSON.stringify(model);
      return true;
    } catch (error) {
      if (!this._destroyed) this.library.report(error);
      return false;
    } finally {
      this.saving.set(false);
      if (
        this._autosave() &&
        !this._destroyed &&
        !this.form().invalid() &&
        JSON.stringify(model) !== JSON.stringify(this._model())
      ) {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
          void this.save();
        }, 550);
      }
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
      this.library.report(new Error('loc.resonanz.error.authMethod'));
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
    this._testLatencyMs.set(null);
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
        message: 'loc.resonanz.error.manualCredentials',
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
