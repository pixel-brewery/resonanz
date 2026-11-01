// #region Imports

import {
  AiAuthDriverBase,
  AiDriverBase,
  AiError,
  type IAiAuthContext,
  type IAiAuthMethod,
  type IAiAuthStatus,
  type IAiCapabilities,
  type IAiDriverResult,
  type IAiExecutionContext,
  type IAiInstance,
} from '@pixel-brewery/synapse-core';
import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AssistantRunEvent } from '../models/AssistantRunEvent.js';
import type { IAssistantLoginEvent } from '../interfaces/IAssistantLoginEvent.js';
import { AssistantService } from './AssistantService.js';

// #endregion

const owned: { root: string; service: AssistantService }[] = [];

afterEach(async () => {
  for (const entry of owned.splice(0)) {
    await entry.service.dispose();
    await rm(entry.root, { recursive: true, force: true });
  }
});

describe('AssistantService', () => {
  it('uses read-only isolated workspaces and resumes the complete account-bound native session', async () => {
    // Arrange
    const { service, driver, root } = await setup();
    const events: AssistantRunEvent[] = [];
    const configuration = {
      provider: 'codex',
      accountId: 'personal',
      model: 'native-model',
    } as const;

    // Act
    const first = await service.execute(
      {
        runId: 'first',
        sessionId: 'meeting-one',
        prompt: 'Summarize the supplied transcript.',
        configuration,
      },
      (event) => {
        events.push(event);
      },
    );
    await service.execute({
      runId: 'second',
      sessionId: 'meeting-one',
      prompt: 'Which decision was made?',
      configuration,
      continuation: first.continuation,
    });

    // Assert
    expect(first.text).toBe('The team selected Friday.');
    expect(events).toContainEqual({
      type: 'text',
      runId: 'first',
      text: 'The team selected Friday.',
    });
    expect(events.some((event) => event.type === 'continuation')).toBe(true);
    expect(driver.invocations).toHaveLength(2);
    expect(driver.invocations[0]?.request.policy).toEqual({ mode: 'read-only' });
    expect(driver.invocations[0]?.workingDirectory).toBe(
      join(root, 'assistant-workspaces', 'meeting-one'),
    );
    const profileRoot = await realpath(join(root, 'ai-profiles'));
    expect(driver.invocations[0]?.instance.profile.paths.root.startsWith(profileRoot)).toBe(true);
    expect(driver.invocations[0]?.instance.environment?.['OPENAI_API_KEY']).toBeUndefined();
    expect(driver.invocations[0]?.instance.environment?.['HOME']).toBeUndefined();
    expect(driver.invocations[1]?.request.session?.nativeId).toBe('native-conversation');
    expect(driver.invocations[1]?.request.session?.authenticationGeneration).toBeTruthy();
  });

  it('rejects continuation reuse by another account before a native prompt is submitted', async () => {
    // Arrange
    const { service, driver } = await setup();
    const first = await service.execute({
      runId: 'first',
      sessionId: 'meeting-one',
      prompt: 'A first question.',
      configuration: { provider: 'codex', accountId: 'personal' },
    });

    // Act
    const attempt = service.execute({
      runId: 'foreign',
      sessionId: 'meeting-one',
      prompt: 'A follow-up question.',
      configuration: { provider: 'codex', accountId: 'different' },
      continuation: first.continuation,
    });

    // Assert
    await expect(attempt).rejects.toMatchObject({ code: 'session-unavailable' });
    expect(driver.invocations).toHaveLength(1);
  });

  it('cancels and awaits the actual Synapse execution instead of synthesizing a successful answer', async () => {
    // Arrange
    const { service, driver } = await setup();
    const started = Promise.withResolvers<void>();
    const stopped = Promise.withResolvers<void>();
    driver.executeHook = async (context) => {
      started.resolve();

      return await new Promise<IAiDriverResult>((_resolve, reject) => {
        context.signal.addEventListener(
          'abort',
          () => {
            stopped.resolve();
            reject(context.signal.reason);
          },
          { once: true },
        );
      });
    };
    const result = service
      .execute({
        runId: 'cancel-me',
        sessionId: 'meeting-one',
        prompt: 'A slow question.',
        configuration: { provider: 'codex' },
      })
      .catch((cause: unknown) => cause);
    await started.promise;

    // Act
    await service.cancel('cancel-me');

    // Assert
    await stopped.promise;
    expect(await result).toMatchObject({ code: 'cancelled' });
    expect(driver.invocations).toHaveLength(1);
  });

  it('requires explicit correlated login, rejects stale input and excludes submitted secrets from events', async () => {
    // Arrange
    const { service, driver } = await setup();
    const events: IAssistantLoginEvent[] = [];
    const waiting = Promise.withResolvers<IAssistantLoginEvent>();
    const completed = Promise.withResolvers<void>();
    const configuration = { provider: 'codex' } as const;
    expect(driver.auth.loginCount).toBe(0);
    const operationId = await service.startLogin(configuration, 'test-native', (event) => {
      events.push(event);

      if (event.state === 'waiting') waiting.resolve(event);
      if (event.state === 'succeeded') completed.resolve();
    });
    const interaction = (await waiting.promise).interaction;
    expect(interaction).toBeDefined();

    // Act
    expect(() =>
      service.respondLogin({
        operationId,
        interactionId: 'stale-interaction',
        values: { code: 'wrong' },
      }),
    ).toThrow();
    service.respondLogin({
      operationId,
      interactionId: interaction!.id,
      values: { code: 'never-log-this-input' },
    });
    await completed.promise;
    await service.cancelLogin(operationId);
    const status = await service.status(configuration);

    // Assert
    expect(driver.auth.loginCount).toBe(1);
    expect(status.authenticated).toBe(true);
    expect(events.at(-1)?.state).toBe('succeeded');
    expect(events.every((event) => event.operationId === operationId)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('never-log-this-input');
  });

  it('keeps native login procedures available when metadata inspection cannot complete', async () => {
    // Arrange
    const { service, driver } = await setup();
    driver.inspectionFailure = new AiError(
      'provider',
      'Native metadata is temporarily unavailable.',
    );
    driver.auth.authenticated = true;

    // Act
    const status = await service.status({ provider: 'codex' });

    // Assert
    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(status.authMethods[0]?.id).toBe('test-native');
    expect(status.models).toEqual([]);
    expect(status.message).toBe('Native metadata is temporarily unavailable.');
    expect(status.inspectionComplete).toBe(false);
    expect(driver.invocations).toHaveLength(0);
    expect(driver.auth.loginCount).toBe(0);
  });

  it('reports a missing installation without creating profiles or starting native work', async () => {
    // Arrange
    const { service, driver, root } = await setup(false);

    // Act
    const status = await service.status({ provider: 'codex' });

    // Assert
    expect(status.installed).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(driver.invocations).toHaveLength(0);
    expect(driver.auth.loginCount).toBe(0);
    await expect(access(join(root, 'ai-profiles'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects traversal-shaped recording identifiers before preparing a workspace', async () => {
    // Arrange
    const { service, driver } = await setup();

    // Act / Assert
    expect(() =>
      service.execute({
        runId: 'attempt',
        sessionId: '../foreign',
        prompt: 'A question.',
        configuration: { provider: 'codex' },
      }),
    ).toThrow();
    expect(driver.invocations).toHaveLength(0);
  });
});

async function setup(installed = true): Promise<{
  service: AssistantService;
  driver: NativeReplayDriver;
  root: string;
}> {
  await mkdir('.codex-work/assistant-tests', { recursive: true });
  const root = await mkdtemp(resolve('.codex-work/assistant-tests/run-'));
  const driver = new NativeReplayDriver();
  const service = new AssistantService(
    {
      userDataDirectory: root,
      environment: { PATH: '/usr/bin', HOME: root, OPENAI_API_KEY: 'must-not-be-forwarded' },
    },
    {
      drivers: [driver],
      resolveExecutable: () => (installed ? process.execPath : undefined),
    },
  );
  owned.push({ root, service });

  return { service, driver, root };
}

class NativeReplayDriver extends AiDriverBase {
  public readonly id = 'codex';
  public readonly capabilities: IAiCapabilities = {
    modes: ['read-only'],
    resume: true,
    structuredOutput: 'none',
    tools: false,
  };
  public override readonly auth = new NativeReplayAuth();
  public readonly invocations: IAiExecutionContext[] = [];
  public executeHook?: (context: IAiExecutionContext) => Promise<IAiDriverResult>;
  public inspectionFailure?: AiError;

  public override async execute(context: IAiExecutionContext): Promise<IAiDriverResult> {
    this.invocations.push(context);

    if (this.executeHook) return await this.executeHook(context);

    await context.emit({ type: 'text', text: 'The team selected Friday.' });
    await context.emit({ type: 'session', session: context.session('native-conversation') });

    return { text: 'The team selected Friday.', sessionId: 'native-conversation' };
  }

  public override async inspect(instance: IAiInstance, signal: AbortSignal) {
    if (this.inspectionFailure) throw this.inspectionFailure;

    return await super.inspect(instance, signal);
  }
}

class NativeReplayAuth extends AiAuthDriverBase {
  public loginCount = 0;
  public authenticated = false;

  public override methods(): readonly IAiAuthMethod[] {
    return [{ id: 'test-native', label: 'Native test login', kind: 'credentials' }];
  }

  public override async status(): Promise<IAiAuthStatus> {
    return { authenticated: this.authenticated };
  }

  public override async login(context: IAiAuthContext): Promise<void> {
    this.loginCount++;
    context.interaction({
      id: 'native-challenge',
      type: 'credentials',
      expiresAt: Date.now() + 10_000,
      fields: [{ id: 'code', label: 'Native code', secret: true, required: true }],
    });
    const values = await context.response('native-challenge');
    this.authenticated = Boolean(values['code']);
  }

  public override async logout(): Promise<void> {
    this.authenticated = false;
  }
}
