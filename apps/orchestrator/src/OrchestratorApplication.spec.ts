// #region Imports
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dataSchemas, type AppEvent } from '@resonanz/contracts';
import type { IAssistantLoginEvent } from '@resonanz/assistant';
import { OrchestratorApplication } from './OrchestratorApplication.js';
// #endregion

const native = vi.hoisted(() => ({
  execute: vi.fn(),
  cancel: vi.fn(),
  dispose: vi.fn(),
  startLogin: vi.fn(),
  cancelLogin: vi.fn(),
  logout: vi.fn(),
  status: vi.fn(),
}));
vi.mock('@resonanz/assistant', () => ({
  AssistantService: vi.fn(function () {
    return native;
  }),
}));
const applications: OrchestratorApplication[] = [];
const roots: string[] = [];
const unsettled = new Set<(cause: Error) => void>();

function pendingRun() {
  let resolve!: (value: { text: string; continuation?: string }) => void;
  let reject!: (cause: Error) => void;
  const result = new Promise<{ text: string; continuation?: string }>(
    (resolvePromise, rejectPromise) => {
      reject = (cause) => {
        unsettled.delete(reject);
        rejectPromise(cause);
      };
      resolve = (value) => {
        unsettled.delete(reject);
        resolvePromise(value);
      };
    },
  );
  unsettled.add(reject);
  native.execute.mockReturnValueOnce(result);
  return { resolve, reject };
}
async function setup() {
  await mkdir('.codex-work/orchestrator-tests', { recursive: true });
  const root = await mkdtemp(resolve('.codex-work/orchestrator-tests/run-'));
  roots.push(root);
  const events: AppEvent[] = [];
  const application = new OrchestratorApplication(root, {}, (event) => events.push(event));
  applications.push(application);
  await application.initialize();
  const session = dataSchemas.session.parse(
    await application.request('sessions.create', {
      kind: 'conversation',
      title: 'Planungsrunde',
      mimeType: 'audio/webm',
    }),
  );
  await application.request('transcript.append', {
    sessionId: session.id,
    id: 'turn-1',
    speaker: 'participant',
    text: 'Wir liefern am Freitag.',
    startMs: 100,
    endMs: 800,
    final: true,
  });
  return { root, application, sessionId: session.id, events };
}
async function getSession(application: OrchestratorApplication, sessionId: string) {
  return dataSchemas.session.parse(await application.request('sessions.get', { sessionId }));
}
async function waitForRun(events: AppEvent[], runId: string) {
  await vi.waitFor(() =>
    expect(
      events.some(
        (event) =>
          (event.type === 'assistant.completed' || event.type === 'assistant.failed') &&
          event.runId === runId,
      ),
    ).toBe(true),
  );
}
async function seedContinuation(context: Awaited<ReturnType<typeof setup>>) {
  native.execute.mockResolvedValueOnce({
    text: 'Die Lieferung ist für Freitag vorgesehen.',
    continuation: 'opaque-old-session',
  });
  const runId = randomUUID();
  await context.application.request('sessions.ask', {
    sessionId: context.sessionId,
    runId,
    question: 'Wann liefern wir?',
  });
  await waitForRun(context.events, runId);
  const record = JSON.parse(
    await readFile(join(context.root, 'library', 'sessions', `${context.sessionId}.json`), 'utf8'),
  );
  expect(Object.values(record.continuations)).toEqual(['opaque-old-session']);
}

beforeEach(() => {
  for (const method of Object.values(native)) method.mockReset();
  native.cancel.mockResolvedValue(undefined);
  native.dispose.mockResolvedValue(undefined);
  native.logout.mockResolvedValue(undefined);
  native.cancelLogin.mockResolvedValue(undefined);
  native.status.mockResolvedValue({
    authMethods: [{ id: 'native-browser', label: 'Browser', kind: 'browser' }],
  });
});
afterEach(async () => {
  for (const reject of [...unsettled]) reject(new Error('test cleanup'));
  await Promise.allSettled(applications.splice(0).map((application) => application.dispose()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('OrchestratorApplication capture lifecycle', () => {
  it.each([
    { transition: 'paused', outcome: 'success' },
    { transition: 'paused', outcome: 'failure' },
    { transition: 'ready', outcome: 'success' },
    { transition: 'ready', outcome: 'failure' },
  ] as const)(
    'a pending native conversation cannot undo $transition after $outcome',
    async ({ transition, outcome }) => {
      // arrange
      const { application, sessionId, events } = await setup();
      const nativeRun = pendingRun();
      const runId = randomUUID();
      await application.request('live.respond', { sessionId, runId });
      await vi.waitFor(() => expect(native.execute).toHaveBeenCalledTimes(1));
      // act
      let finished: Promise<unknown> | undefined;
      if (transition === 'paused')
        await application.request('sessions.update', { sessionId, status: 'paused' });
      else {
        finished = application.request('sessions.finish', { sessionId, durationMs: 1000 });
        await vi.waitFor(() => expect(native.cancel).toHaveBeenCalledTimes(1));
      }
      if (outcome === 'success') nativeRun.resolve({ text: 'Freitag ist vereinbart.' });
      else nativeRun.reject(new Error('provider failed'));
      await waitForRun(events, runId);
      await finished;
      // assert
      const saved = await getSession(application, sessionId);
      expect(saved.status).toBe(transition);
      expect(saved.transcript[0]?.text).toBe('Wir liefern am Freitag.');
      expect(
        events.some((event) => event.type === 'assistant.completed' && event.runId === runId),
      ).toBe(transition === 'paused' && outcome === 'success');
      if (transition === 'ready') expect(saved.messages.at(-1)?.state).toBe('cancelled');
    },
  );

  it.each(['success', 'failure'] as const)(
    'finishing capture during an ordinary question preserves ready after %s',
    async (outcome) => {
      // arrange
      const { application, sessionId, events } = await setup();
      const nativeRun = pendingRun();
      const runId = randomUUID();
      await application.request('sessions.ask', {
        sessionId,
        runId,
        question: 'Was wurde vereinbart?',
      });
      await vi.waitFor(() => expect(native.execute).toHaveBeenCalledTimes(1));
      // act
      await application.request('sessions.finish', { sessionId, durationMs: 1200 });
      if (outcome === 'success') nativeRun.resolve({ text: 'Wir liefern am Freitag.' });
      else nativeRun.reject(new Error('provider failed'));
      await waitForRun(events, runId);
      // assert
      expect((await getSession(application, sessionId)).status).toBe('ready');
      expect(native.cancel).not.toHaveBeenCalled();
    },
  );

  it('restores only processing owned by this run and does not replace a newer explicit finish state', async () => {
    // arrange
    const { application, sessionId, events } = await setup();
    await application.request('sessions.finish', {
      sessionId,
      durationMs: 1000,
      error: 'Vorheriger Aufnahmefehler',
    });
    const nativeRun = pendingRun();
    const runId = randomUUID();
    await application.request('sessions.analyze', { sessionId, runId });
    await vi.waitFor(() => expect(native.execute).toHaveBeenCalledTimes(1));
    expect((await getSession(application, sessionId)).status).toBe('processing');
    // act
    await application.request('sessions.finish', { sessionId, durationMs: 1000 });
    nativeRun.resolve({ text: 'Eine Lieferung am Freitag.' });
    await waitForRun(events, runId);
    // assert
    const saved = await getSession(application, sessionId);
    expect(saved.status).toBe('ready');
    expect(saved.error).toBeUndefined();
    expect(saved.summary).toBe('Eine Lieferung am Freitag.');
  });
});

describe('OrchestratorApplication native continuation ownership', () => {
  it('rejects credential-based login methods before admitting a native auth transition', async () => {
    const context = await setup();
    native.status.mockResolvedValueOnce({
      authMethods: [{ id: 'manual-secret', label: 'Credential', kind: 'credentials' }],
    });
    await expect(
      context.application.request('assistant.login.start', { methodId: 'manual-secret' }),
    ).rejects.toThrow('Assistentenkonto');
    expect(native.startLogin).not.toHaveBeenCalled();
  });
  it.each(['logout', 'login-failed', 'login-cancelled', 'logout-failed', 'configuration'] as const)(
    'clears a stale private reference before %s while retaining transcript and question history',
    async (transition) => {
      // arrange
      const context = await setup();
      await seedContinuation(context);
      const before = await getSession(context.application, context.sessionId);
      const assertCleared = async () => {
        const record = JSON.parse(
          await readFile(
            join(context.root, 'library', 'sessions', `${context.sessionId}.json`),
            'utf8',
          ),
        );
        expect(record.continuations).toEqual({});
      };
      // act
      if (transition === 'logout' || transition === 'logout-failed') {
        native.logout.mockImplementationOnce(async () => {
          await assertCleared();
          if (transition === 'logout-failed') throw new Error('logout verification failed');
        });
        const result = context.application.request('assistant.logout', {});
        if (transition === 'logout-failed')
          await expect(result).rejects.toThrow('verification failed');
        else await result;
      } else if (transition === 'configuration') {
        await context.application.request('settings.save', {
          assistant: { provider: 'codex', executable: join(context.root, 'different-codex') },
        });
      } else {
        native.startLogin.mockImplementationOnce(
          async (
            _configuration: unknown,
            _method: string,
            onEvent: (event: IAssistantLoginEvent) => void,
          ) => {
            await assertCleared();
            onEvent({
              operationId: 'login-1',
              state: transition === 'login-failed' ? 'failed' : 'cancelled',
            });
            return 'login-1';
          },
        );
        await context.application.request('assistant.login.start', { methodId: 'native-browser' });
      }
      const after = await getSession(context.application, context.sessionId);
      native.execute.mockResolvedValueOnce({ text: 'Weiterhin Freitag.' });
      const runId = randomUUID();
      await context.application.request('sessions.ask', {
        sessionId: context.sessionId,
        runId,
        question: 'Gilt das noch?',
      });
      await waitForRun(context.events, runId);
      // assert
      expect(after.transcript).toEqual(before.transcript);
      expect(after.messages).toEqual(before.messages);
      const nextRequest = native.execute.mock.calls[1]?.[0];
      expect(nextRequest?.continuation).toBeUndefined();
      expect(nextRequest?.prompt).toContain('Wir liefern am Freitag.');
      expect(nextRequest?.prompt).toContain('Die Lieferung ist für Freitag vorgesehen.');
      expect(native.execute).toHaveBeenCalledTimes(2);
    },
  );

  it('does not repersist an old run continuation after a binding transition races its completion', async () => {
    // arrange
    const context = await setup();
    const nativeRun = pendingRun();
    const firstRun = randomUUID();
    await context.application.request('sessions.ask', {
      sessionId: context.sessionId,
      runId: firstRun,
      question: 'Wann liefern wir?',
    });
    await vi.waitFor(() => expect(native.execute).toHaveBeenCalledTimes(1));
    // act
    await context.application.request('settings.save', {
      assistant: { provider: 'codex', executable: join(context.root, 'new-codex') },
    });
    nativeRun.resolve({ text: 'Am Freitag.', continuation: 'must-not-survive-new-binding' });
    await waitForRun(context.events, firstRun);
    const record = JSON.parse(
      await readFile(
        join(context.root, 'library', 'sessions', `${context.sessionId}.json`),
        'utf8',
      ),
    );
    native.execute.mockResolvedValueOnce({ text: 'Ja, am Freitag.' });
    const nextRun = randomUUID();
    await context.application.request('sessions.ask', {
      sessionId: context.sessionId,
      runId: nextRun,
      question: 'Noch einmal bitte.',
    });
    await waitForRun(context.events, nextRun);
    // assert
    expect(record.continuations).toEqual({});
    expect(native.execute.mock.calls[1]?.[0]?.continuation).toBeUndefined();
    expect(native.execute.mock.calls[1]?.[0]?.prompt).toContain('Am Freitag.');
  });

  it('does not start an inference while an admitted native login is still waiting', async () => {
    // arrange
    const context = await setup();
    let publishLogin!: (event: IAssistantLoginEvent) => void;
    native.startLogin.mockImplementationOnce(
      async (
        _configuration: unknown,
        _method: string,
        onEvent: (event: IAssistantLoginEvent) => void,
      ) => {
        publishLogin = onEvent;
        onEvent({
          operationId: 'login-1',
          state: 'waiting',
          interaction: { id: 'interaction-1', type: 'browser', expiresAt: Date.now() + 60_000 },
        });
        return 'login-1';
      },
    );
    await context.application.request('assistant.login.start', { methodId: 'native-browser' });
    // act / assert
    await expect(
      context.application.request('sessions.ask', {
        sessionId: context.sessionId,
        runId: randomUUID(),
        question: 'Schon bereit?',
      }),
    ).rejects.toThrow('Anmeldung oder Konfiguration');
    expect(native.execute).not.toHaveBeenCalled();
    publishLogin({ operationId: 'login-1', state: 'cancelled' });
    native.execute.mockResolvedValueOnce({ text: 'Jetzt bereit.' });
    const runId = randomUUID();
    await context.application.request('sessions.ask', {
      sessionId: context.sessionId,
      runId,
      question: 'Jetzt?',
    });
    await waitForRun(context.events, runId);
    expect(native.execute).toHaveBeenCalledTimes(1);
  });
});
