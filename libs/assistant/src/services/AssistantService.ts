// #region Imports

import { AuthManager, ProfileManager } from '@pixel-brewery/synapse-auth';
import type { AuthState, IAuthHandle } from '@pixel-brewery/synapse-auth';
import {
  AiError,
  encodeSessionReference,
  parseSessionReference,
} from '@pixel-brewery/synapse-core';
import type {
  AiDriverBase,
  AiEvent,
  IAiAuthStatus,
  IAiInstance,
  IAiRunHandle,
} from '@pixel-brewery/synapse-core';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';
import { ClaudeDriver } from '@pixel-brewery/synapse-provider-claude';
import { OpenCodeDriver } from '@pixel-brewery/synapse-provider-opencode';
import { AiRuntime, NodeProcessRunner } from '@pixel-brewery/synapse-runtime';
import type { ProcessRunnerBase } from '@pixel-brewery/synapse-runtime';
import { accessSync, constants, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import type { IAssistantConfiguration } from '../interfaces/IAssistantConfiguration.js';
import type { IAssistantInstallation } from '../interfaces/IAssistantInstallation.js';
import type { IAssistantLoginEvent } from '../interfaces/IAssistantLoginEvent.js';
import type { IAssistantLoginResponse } from '../interfaces/IAssistantLoginResponse.js';
import type { IAssistantResult } from '../interfaces/IAssistantResult.js';
import type { IAssistantRunRequest } from '../interfaces/IAssistantRunRequest.js';
import type { IAssistantServiceDependencies } from '../interfaces/IAssistantServiceDependencies.js';
import type { IAssistantServiceOptions } from '../interfaces/IAssistantServiceOptions.js';
import type { IAssistantStatus } from '../interfaces/IAssistantStatus.js';
import type { AssistantProvider } from '../models/AssistantProvider.js';
import type { AssistantRunEvent } from '../models/AssistantRunEvent.js';
import { resolveAssistantExecutable } from '../resolveAssistantExecutable.js';

// #endregion

interface ActiveRun {
  readonly controller: AbortController;
  handle?: IAiRunHandle;
  completion?: Promise<IAssistantResult>;
}

interface PreparedInstance {
  readonly fingerprint: string;
  readonly instance: IAiInstance;
}

interface ActiveLogin {
  readonly handle: IAuthHandle;
  completion: Promise<void>;
}

const providers: readonly AssistantProvider[] = ['codex', 'claude', 'opencode'];
const authenticationOwner = 'resonanz-settings';
const environmentKeys = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'SHELL',
  'TERM',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
]);

/**
 * Utility-process owner for explicit native assistant accounts and conversational text turns.
 *
 * @remarks Audio capture/STT/TTS and product prompts remain with their application owners.
 * Construction is inert. Status, login and execution use the same Synapse profile coordinator.
 *
 * @public
 */
export class AssistantService {
  // #region Fields

  private readonly _root: string;
  private readonly _environment: Readonly<Record<string, string>>;
  private readonly _discoveryEnvironment: Readonly<Record<string, string | undefined>>;
  private readonly _runner: ProcessRunnerBase;
  private readonly _drivers: ReadonlyMap<string, AiDriverBase>;
  private readonly _profiles: ProfileManager;
  private readonly _runtime: AiRuntime;
  private readonly _auth: AuthManager;
  private readonly _resolver: NonNullable<IAssistantServiceDependencies['resolveExecutable']>;
  private readonly _instances = new Map<string, PreparedInstance>();
  private readonly _preparing = new Map<string, Promise<void>>();
  private readonly _runs = new Map<string, ActiveRun>();
  private readonly _inspections = new Map<AbortController, Promise<unknown>>();
  private readonly _logins = new Map<string, ActiveLogin>();
  private _disposed = false;
  private _disposal?: Promise<void>;
  private _backgroundFailure?: unknown;

  // #endregion

  // #region Ctor

  /**
   * Composes one inert native lifecycle owner using captured bootstrap configuration.
   *
   * @param options - Private host storage and captured process environment.
   * @param dependencies - Explicit test/native process substitutions, whose ownership transfers here.
   * @throws Error when the host data directory is not absolute or drivers are duplicated.
   *
   * @public
   */
  public constructor(
    options: IAssistantServiceOptions,
    dependencies: IAssistantServiceDependencies = {},
  ) {
    if (!isAbsolute(options.userDataDirectory))
      throw new Error('Das Resonanz-Datenverzeichnis muss absolut sein.');

    this._root = options.userDataDirectory;
    this._discoveryEnvironment = Object.freeze({ ...options.environment });
    this._environment = Object.freeze(
      Object.fromEntries(
        Object.entries(options.environment).flatMap(([key, value]) =>
          typeof value === 'string' && environmentKeys.has(key.toUpperCase())
            ? [[key.toUpperCase(), value]]
            : [],
        ),
      ),
    );
    this._runner = dependencies.runner ?? new NodeProcessRunner();
    const drivers = dependencies.drivers ?? [
      new CodexDriver(this._runner),
      new ClaudeDriver(this._runner),
      new OpenCodeDriver(this._runner),
    ];

    if (new Set(drivers.map((driver) => driver.id)).size !== drivers.length)
      throw new Error('Assistenten müssen eindeutige Kennungen besitzen.');

    this._drivers = new Map(drivers.map((driver) => [driver.id, driver]));
    this._resolver = dependencies.resolveExecutable ?? resolveAssistantExecutable;
    this._profiles = new ProfileManager({
      rootDirectory: join(this._root, 'ai-profiles'),
      maxProfiles: 32,
    });
    this._runtime = new AiRuntime({
      drivers,
      instances: [],
      maximumRuns: 8,
      eventCapacity: 128,
      maximumPromptBytes: 1024 * 1024,
      defaultTimeoutMs: 120_000,
    });
    this._auth = new AuthManager(this._runtime.access, {
      defaultTimeoutMs: 600_000,
      statusTimeoutMs: 15_000,
    });
  }

  // #endregion

  // #region Methods

  /**
   * Discovers supported native executable files without touching account credentials.
   *
   * @returns Product-supported installations, including unavailable assistants.
   *
   * @public
   */
  public detect(): readonly IAssistantInstallation[] {
    this.assertOpen();

    return providers.map((provider) => {
      const executable = this._resolver(provider, this._discoveryEnvironment);

      return { provider, installed: Boolean(executable), ...(executable ? { executable } : {}) };
    });
  }

  /**
   * Inspects one isolated native account with a fifteen-second bound and no implicit login.
   *
   * @param configuration - Explicit provider, account and optional native model selection.
   * @returns Verified native state and advertised metadata, or an unavailable installation.
   * @throws Error for invalid configuration, native inspection or blocked account transitions.
   *
   * @public
   */
  public async status(configuration: IAssistantConfiguration): Promise<IAssistantStatus> {
    configuration = Object.freeze({ ...configuration });
    this.assertOpen();
    this.validateConfiguration(configuration);
    const executable = this.executable(configuration);

    if (!executable)
      return {
        provider: configuration.provider,
        installed: false,
        authenticated: false,
        models: [],
        authMethods: [],
        message: 'Die ausgewählte Assistenten-CLI wurde nicht gefunden.',
      };

    const instance = await this.prepare(configuration, executable);
    const driver = this.driver(configuration.provider);

    if (this._inspections.size >= 8)
      throw new Error('Es laufen bereits zu viele Assistentenprüfungen.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const work = (async (): Promise<IAssistantStatus> => {
      let failure: unknown;
      let accountStatus: IAiAuthStatus | undefined;
      let release: ((error?: unknown) => void) | undefined;

      try {
        this.assertOpen();
        release = this._runtime.access.enter(instance.profile.id, () => controller.abort());
        accountStatus = await driver.auth?.status(instance, controller.signal);
        const inspection = await driver.inspect(instance, controller.signal);

        return {
          provider: configuration.provider,
          installed: true,
          executable,
          authenticated: inspection.auth.authenticated,
          ...(inspection.auth.displayName || inspection.auth.accountId
            ? { accountLabel: inspection.auth.displayName ?? inspection.auth.accountId }
            : {}),
          models: (inspection.models ?? []).map((model) => ({
            id: model.id,
            ...(model.name ? { name: model.name } : {}),
            ...(model.isDefault !== undefined ? { isDefault: model.isDefault } : {}),
            ...(model.reasoningEfforts ? { reasoningEfforts: [...model.reasoningEfforts] } : {}),
          })),
          authMethods: (driver.auth?.methods(instance) ?? []).map((method) => ({ ...method })),
          ...(inspection.auth.message ? { message: inspection.auth.message } : {}),
        };
      } catch (cause) {
        failure = cause;

        if (cause instanceof AiError && cause.cleanupIncomplete) throw cause;

        return {
          provider: configuration.provider,
          installed: true,
          executable,
          authenticated: accountStatus?.authenticated ?? false,
          ...(accountStatus?.displayName || accountStatus?.accountId
            ? { accountLabel: accountStatus.displayName ?? accountStatus.accountId }
            : {}),
          models: [],
          authMethods: (driver.auth?.methods(instance) ?? []).map((method) => ({ ...method })),
          message:
            cause instanceof AiError
              ? cause.message
              : 'Der Anmeldestatus konnte nicht geprüft werden. Eine native Anmeldung ist weiterhin möglich.',
        };
      } finally {
        release?.(failure);
        clearTimeout(timer);
        this._inspections.delete(controller);
      }
    })();

    this._inspections.set(controller, work);

    return await work;
  }

  /**
   * Executes one host-composed analysis/question/live text turn in a read-only session workspace.
   *
   * @param request - Correlated session prompt, explicit account and complete optional continuation.
   * @param onEvent - Critical normalized progress callback; failure cancels native work without replay.
   * @param signal - Optional caller cancellation propagated through awaited native teardown.
   * @returns Final text and complete account-bound continuation.
   * @throws Error for invalid requests, duplicate active IDs, native failures or failed cleanup.
   *
   * @public
   */
  public execute(
    request: IAssistantRunRequest,
    onEvent?: (event: AssistantRunEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<IAssistantResult> {
    request = Object.freeze({
      ...request,
      configuration: Object.freeze({ ...request.configuration }),
    });
    this.assertOpen();
    validateIdentifier(request.runId, 'Ausführung');
    validateIdentifier(request.sessionId, 'Session');
    this.validateConfiguration(request.configuration);

    if (!request.prompt.trim() || Buffer.byteLength(request.prompt, 'utf8') > 1024 * 1024)
      throw new Error('Der Assistentenauftrag ist leer oder zu groß.');

    if (this._runs.has(request.runId)) throw new Error('Diese Ausführung läuft bereits.');

    if (this._runs.size >= 8) throw new Error('Es laufen bereits zu viele Assistentenaufträge.');

    const state: ActiveRun = { controller: new AbortController() };
    const abort = (): void => state.controller.abort();

    if (signal?.aborted) abort();

    signal?.addEventListener('abort', abort, { once: true });
    this._runs.set(request.runId, state);
    state.completion = this.executeRun(request, state, onEvent).finally(() => {
      signal?.removeEventListener('abort', abort);
      this._runs.delete(request.runId);
    });

    return state.completion;
  }

  /**
   * Cancels one correlated turn and waits until its owned native work has stopped.
   *
   * @param runId - Active execution ID; unknown/already-completed IDs are harmless.
   * @returns Completion after cancellation and owned cleanup settle.
   *
   * @public
   */
  public async cancel(runId: string): Promise<void> {
    const state = this._runs.get(runId);

    if (!state) return;

    state.controller.abort();
    await state.handle?.cancel();
    await state.completion?.catch((cause: unknown) => {
      if (cause instanceof AiError && cause.cleanupIncomplete) throw cause;
    });
  }

  /**
   * Starts only the native login procedure explicitly selected by the settings UI.
   *
   * @param configuration - Isolated account selected by the user.
   * @param methodId - A procedure returned by this configuration's native auth methods.
   * @param onEvent - Correlated safe lifecycle callback; submitted credentials are excluded.
   * @returns Resonanz login operation ID for responses and cancellation.
   * @throws Error when native login is unsupported, unavailable or incorrectly configured.
   *
   * @public
   */
  public async startLogin(
    configuration: IAssistantConfiguration,
    methodId: string,
    onEvent: (event: IAssistantLoginEvent) => void | Promise<void>,
  ): Promise<string> {
    configuration = Object.freeze({ ...configuration });
    this.assertOpen();

    if (this._logins.size >= 4) throw new Error('Es laufen bereits zu viele Anmeldungen.');

    const instance = await this.prepare(configuration);
    const native = this.driver(configuration.provider).auth;

    if (!native) throw new Error('Dieser Assistent unterstützt keine native Anmeldung.');

    this.assertOpen();

    if (this._logins.size >= 4) throw new Error('Es laufen bereits zu viele Anmeldungen.');

    const operationId = randomUUID();
    const handle = this._auth.start(instance, native, {
      ownerId: authenticationOwner,
      methodId,
    });
    const settled = handle.result.then(
      () => undefined,
      () => undefined,
    );
    const login: ActiveLogin = { handle, completion: Promise.resolve() };

    this._logins.set(operationId, login);
    login.completion = (async () => {
      try {
        for await (const state of handle.events) await onEvent(this.loginEvent(operationId, state));
      } catch (cause) {
        await handle.cancel();

        throw cause;
      } finally {
        await settled;
        this._logins.delete(operationId);
      }
    })();
    void login.completion.catch((cause: unknown) => {
      this._backgroundFailure ??= cause;
    });

    return operationId;
  }

  /**
   * Submits one current native login response after checking operation and interaction ownership.
   *
   * @param response - Correlated input values supplied by the active settings interaction.
   * @throws Error for stale, completed, mismatched or expired interactions.
   *
   * @public
   */
  public respondLogin(response: IAssistantLoginResponse): void {
    this.assertOpen();
    const login = this._logins.get(response.operationId);
    const state = login?.handle.state;

    if (!login || state?.state !== 'waiting' || state.interaction.id !== response.interactionId)
      throw new Error('Diese Anmeldeinteraktion ist nicht mehr aktuell.');

    login.handle.respond({
      ownerId: authenticationOwner,
      operationId: state.operationId,
      interactionId: response.interactionId,
      values: response.values,
    });
  }

  /**
   * Cancels a native login and drains its correlated event delivery.
   *
   * @param operationId - Resonanz login ID; already-completed IDs are harmless.
   * @returns Completion after native cleanup and event delivery settle.
   *
   * @public
   */
  public async cancelLogin(operationId: string): Promise<void> {
    const login = this._logins.get(operationId);

    if (!login) return;

    await login.handle.cancel();
    await login.completion;
  }

  /**
   * Explicitly signs out the selected application-owned native account.
   *
   * @param configuration - Account to sign out; other application/global accounts are untouched.
   * @returns Completion after Synapse drains executions and verifies native signed-out status.
   *
   * @public
   */
  public async logout(configuration: IAssistantConfiguration): Promise<void> {
    configuration = Object.freeze({ ...configuration });
    this.assertOpen();
    const instance = await this.prepare(configuration);
    const native = this.driver(configuration.provider).auth;

    if (!native) throw new Error('Dieser Assistent unterstützt keine native Abmeldung.');

    await this._auth.logout(instance, native);
  }

  /**
   * Stops all service-owned inspections, authentication flows, turns and native process trees.
   *
   * @returns Idempotent completion after every owned lifecycle settles.
   * @throws AggregateError when native cleanup or a critical background callback fails.
   *
   * @public
   */
  public dispose(): Promise<void> {
    if (this._disposal) return this._disposal;

    this._disposed = true;

    for (const state of this._runs.values()) state.controller.abort();

    for (const controller of this._inspections.keys()) controller.abort();

    this._disposal = (async () => {
      const pending = await Promise.allSettled([
        ...this._preparing.values(),
        ...[...this._runs.values()].map((state) => state.handle?.cancel()),
        ...[...this._logins.values()].map((login) => login.handle.cancel()),
      ]);
      const settledWork = await Promise.allSettled([
        ...this._inspections.values(),
        ...[...this._runs.values()].map((state) => state.completion),
      ]);
      const cleanup = await Promise.allSettled([
        this._auth.dispose(),
        this._runtime.dispose(),
        this._runner.dispose(),
      ]);
      await Promise.allSettled([...this._logins.values()].map((login) => login.completion));
      const failures = [...pending, ...cleanup].flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );

      for (const result of settledWork)
        if (
          result.status === 'rejected' &&
          result.reason instanceof AiError &&
          result.reason.cleanupIncomplete
        )
          failures.push(result.reason);

      if (this._backgroundFailure) failures.push(this._backgroundFailure);

      if (failures.length)
        throw new AggregateError(failures, 'Die Assistenten wurden nicht vollständig beendet.');
    })();

    return this._disposal;
  }

  private async executeRun(
    request: IAssistantRunRequest,
    state: ActiveRun,
    onEvent?: (event: AssistantRunEvent) => void | Promise<void>,
  ): Promise<IAssistantResult> {
    state.controller.signal.throwIfAborted();
    const instance = await this.prepare(request.configuration);

    state.controller.signal.throwIfAborted();
    this.assertOpen();
    const workspace = join(this._root, 'assistant-workspaces', request.sessionId);

    await mkdir(workspace, { recursive: true, mode: 0o700 });
    state.controller.signal.throwIfAborted();
    const continuation = request.continuation
      ? parseSessionReference(request.continuation)
      : undefined;

    if (request.continuation && !continuation)
      throw new Error('Die gespeicherte Assistentenfortsetzung ist ungültig.');

    state.handle = this._runtime.run({
      target: {
        instanceId: instance.id,
        candidateId: `${instance.id}:${request.configuration.model ?? 'default'}`,
      },
      prompt: request.prompt,
      policy: { mode: 'read-only' },
      workingDirectory: workspace,
      ...(request.configuration.model ? { model: request.configuration.model } : {}),
      ...(continuation ? { session: continuation } : {}),
      signal: state.controller.signal,
      ...(onEvent
        ? {
            onEvent: async (event: AiEvent) => {
              const normalized = this.runEvent(request.runId, event);

              if (normalized) await onEvent(normalized);
            },
          }
        : {}),
    });
    const result = await state.handle.result;

    return {
      text: result.text,
      ...(result.session ? { continuation: encodeSessionReference(result.session) } : {}),
    };
  }

  private async prepare(
    configuration: IAssistantConfiguration,
    knownExecutable?: string,
  ): Promise<IAiInstance> {
    configuration = Object.freeze({ ...configuration });
    this.assertOpen();
    this.validateConfiguration(configuration);
    const account = configuration.accountId ?? 'default';
    const id = `resonanz:${configuration.provider}:${account}`;
    const executable = knownExecutable ?? this.executable(configuration);

    if (!executable) throw new Error('Die ausgewählte Assistenten-CLI wurde nicht gefunden.');

    const nativeConfiguration =
      configuration.provider === 'opencode'
        ? {
            providerId:
              configuration.nativeProviderId ?? configuration.model?.split('/')[0] ?? 'openai',
            ...(configuration.nativeAuthMethod
              ? { authMethod: configuration.nativeAuthMethod }
              : {}),
          }
        : undefined;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([executable, nativeConfiguration]))
      .digest('hex');
    const existing = this._instances.get(id);

    if (existing?.fingerprint === fingerprint && !this._preparing.has(id)) return existing.instance;

    if (this._preparing.size >= 16 || (!existing && this._instances.size >= 32))
      throw new Error('Die maximale Anzahl lokaler Assistentenkonten ist erreicht.');

    let instance: IAiInstance | undefined;
    const work = (this._preparing.get(id) ?? Promise.resolve()).then(async () => {
      this.assertOpen();
      const current = this._instances.get(id);

      if (current?.fingerprint === fingerprint) {
        instance = current.instance;

        return;
      }

      const profile = await this._profiles.create({
        applicationId: 'resonanz',
        accountId: account,
        driverId: configuration.provider,
      });

      this.assertOpen();
      instance = {
        id,
        driverId: configuration.provider,
        profile,
        executable,
        environment: this._environment,
        ...(nativeConfiguration ? { configuration: nativeConfiguration } : {}),
      };
      await this._runtime.configureInstance(instance);
      this._instances.set(id, { fingerprint, instance });
    });
    const tail = work.catch(() => undefined);

    this._preparing.set(id, tail);

    try {
      await work;

      if (!instance) throw new Error('Das Assistentenkonto konnte nicht vorbereitet werden.');

      return instance;
    } finally {
      if (this._preparing.get(id) === tail) this._preparing.delete(id);
    }
  }

  private executable(configuration: IAssistantConfiguration): string | undefined {
    if (!configuration.executable)
      return this._resolver(configuration.provider, this._discoveryEnvironment);

    const executable = configuration.executable;

    try {
      if (!isAbsolute(executable) || !statSync(executable).isFile()) return undefined;

      accessSync(executable, process.platform === 'win32' ? constants.F_OK : constants.X_OK);

      return executable;
    } catch {
      return undefined;
    }
  }

  private driver(provider: AssistantProvider): AiDriverBase {
    const driver = this._drivers.get(provider);

    if (!driver) throw new Error('Der ausgewählte Assistent ist nicht registriert.');

    return driver;
  }

  private validateConfiguration(configuration: IAssistantConfiguration): void {
    if (!providers.includes(configuration.provider)) throw new Error('Unbekannter Assistent.');

    validateIdentifier(configuration.accountId ?? 'default', 'Konto');

    if (
      configuration.executable !== undefined &&
      (!isAbsolute(configuration.executable) ||
        configuration.executable.length > 4096 ||
        /\p{Cc}/u.test(configuration.executable))
    )
      throw new Error('Der Assistentenpfad muss eine absolute ausführbare Datei bezeichnen.');

    for (const value of [
      configuration.model,
      configuration.nativeProviderId,
      configuration.nativeAuthMethod,
    ])
      if (
        value !== undefined &&
        (!value.trim() || value.length > 512 || value.startsWith('-') || /\p{Cc}/u.test(value))
      )
        throw new Error('Die native Assistentenkonfiguration ist ungültig.');

    this.driver(configuration.provider);
  }

  private runEvent(runId: string, event: AiEvent): AssistantRunEvent | undefined {
    switch (event.type) {
      case 'text':
        return { type: 'text', runId, text: event.text };
      case 'progress':
        return { type: 'progress', runId, message: event.message };
      case 'session':
        return { type: 'continuation', runId, value: encodeSessionReference(event.session) };
      case 'attempt':
      case 'usage':
      case 'overflow':
        return undefined;
    }
  }

  private loginEvent(operationId: string, state: AuthState): IAssistantLoginEvent {
    return {
      operationId,
      state: state.state,
      ...(state.state === 'waiting' ? { interaction: { ...state.interaction } } : {}),
      ...(state.state === 'succeeded' ? { authenticated: state.status.authenticated } : {}),
      ...(state.state === 'failed' ? { message: state.error.message } : {}),
    };
  }

  private assertOpen(): void {
    if (this._disposed) throw new Error('Die Assistentenanbindung wurde bereits beendet.');
  }

  // #endregion
}

function validateIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(value) || value === '.' || value === '..')
    throw new Error(`${label} besitzt eine ungültige Kennung.`);
}
