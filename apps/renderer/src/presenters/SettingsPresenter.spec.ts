// @vitest-environment jsdom
// #region Imports
import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Subject } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  defaultSettings,
  type AppEvent,
  type ISettings,
  type ISessionSummary,
  type ResponsePayload,
} from '@resonanz/contracts';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { CapturePresenter } from './CapturePresenter';
import { SettingsPresenter } from './SettingsPresenter';
// #endregion

type LoginEvent = Extract<AppEvent, { type: 'assistant.login' }>['event'];
type Status = ResponsePayload<'assistant.status'>;

beforeAll(() => {
  getTestBed().resetTestEnvironment();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterEach(() => TestBed.resetTestingModule());
afterAll(() => getTestBed().resetTestEnvironment());

function nativeStatus(provider: ISettings['assistant']['provider']): Status {
  return {
    provider,
    installed: true,
    authenticated: false,
    models: [],
    authMethods: [
      {
        id: provider === 'codex' ? 'chatgpt-browser' : 'subscription',
        label: 'Native login',
        kind: 'browser',
      },
    ],
  };
}

function settingsScope() {
  const settings = signal<ISettings>(structuredClone(defaultSettings));
  const capabilities = signal({
    platform: 'darwin',
    nativeTranscription: false,
    nativeConversation: false,
    speechLocales: [],
    speechVoices: [],
  });
  const events = new Subject<AppEvent>();
  let nextOperation = 1;
  const api = {
    request: vi.fn(async (method: string, _payload: unknown): Promise<unknown> => {
      if (method === 'assistant.status') return nativeStatus(settings().assistant.provider);
      if (method === 'assistant.login.start')
        return { operationId: `operation-${nextOperation++}` };
      return { ok: true };
    }),
  };
  const library = {
    settings,
    sessions: signal<readonly ISessionSummary[]>([]),
    capabilities,
    events: events.asObservable(),
    refresh: vi.fn(async () => undefined),
    refreshStorage: vi.fn(async () => undefined),
    saveSettings: vi.fn(async (changes: Partial<ISettings>) => {
      settings.set({ ...settings(), ...changes });
    }),
    report: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      SettingsPresenter,
      { provide: DesktopApi, useValue: api },
      { provide: LibraryStore, useValue: library },
      { provide: CapturePresenter, useValue: { active: signal(false) } },
    ],
  });
  const presenter = TestBed.inject(SettingsPresenter);
  TestBed.tick();
  return { presenter, api, library, settings, events, capabilities };
}

function waiting(operationId: string, interactionId = 'challenge'): LoginEvent {
  return {
    operationId,
    state: 'waiting',
    interaction: {
      id: interactionId,
      type: 'browser',
      expiresAt: Date.now() + 60_000,
      url: `https://example.test/${operationId}`,
      fields: [
        { id: 'authorizationCode', label: 'Einmaliger Browsercode', secret: true, required: true },
      ],
    },
  };
}

function publish(events: Subject<AppEvent>, event: LoginEvent): void {
  events.next({ type: 'assistant.login', event });
}

describe('SettingsPresenter', () => {
  it('persists the enabled capture, pause, rate and retention preferences through their typed fields', async () => {
    const { presenter, library, api, settings } = settingsScope();
    presenter.form.silenceReminder().value.set(true);
    presenter.form.markPausesInTranscript().value.set(true);
    presenter.setSpeechRateIndex(3);
    presenter.form.audioRetentionDays().value.set('30');
    TestBed.tick();

    expect(await presenter.save()).toBe(true);

    expect(settings()).toMatchObject({
      silenceReminder: true,
      markPausesInTranscript: true,
      speechRate: 1.5,
      audioRetentionDays: 30,
    });
    expect(api.request).toHaveBeenCalledWith('storage.cleanup', {});
    expect(library.refreshStorage).toHaveBeenCalledOnce();
    expect(library.saveSettings.mock.invocationCallOrder[0]).toBeLessThan(
      api.request.mock.invocationCallOrder[0]!,
    );
  });

  it('preserves a stored intermediate speech rate when the visual slider initializes at its nearest step', async () => {
    const { presenter, settings } = settingsScope();
    settings.update((value) => ({ ...value, speechRate: 0.8 }));
    await presenter.initialize();
    presenter.setSpeechRateIndex(presenter.speechRateIndex());
    presenter.form.userName().value.set('Example');

    expect(await presenter.save()).toBe(true);
    expect(settings().speechRate).toBe(0.8);
  });

  it('does not persist an out-of-range native speech rate', async () => {
    const { presenter, library } = settingsScope();
    presenter.form.speechRate().value.set(2.5);
    TestBed.tick();

    expect(await presenter.save()).toBe(false);
    expect(library.saveSettings).not.toHaveBeenCalled();
  });

  it('requires an in-app confirmation and serializes library deletion until native completion', async () => {
    const { presenter, api, library } = settingsScope();
    const cleared = Promise.withResolvers<{ deletedSessionCount: number }>();
    api.request.mockImplementation(async (method) =>
      method === 'sessions.clear' ? cleared.promise : { ok: true },
    );

    await presenter.clearLibrary();
    expect(api.request).not.toHaveBeenCalled();
    presenter.requestClearLibrary();
    const pending = presenter.clearLibrary();
    await presenter.clearLibrary();
    presenter.cancelClearLibrary();
    expect(presenter.confirmingClear()).toBe(true);
    expect(api.request).toHaveBeenCalledExactlyOnceWith('sessions.clear', { confirm: true });
    expect(library.refresh).not.toHaveBeenCalled();
    cleared.resolve({ deletedSessionCount: 2 });
    await pending;

    expect(presenter.confirmingClear()).toBe(false);
    expect(presenter.clearingLibrary()).toBe(false);
    expect(library.refresh).toHaveBeenCalledOnce();
    expect(library.refreshStorage).toHaveBeenCalledOnce();
    expect(library.saveSettings).not.toHaveBeenCalled();
  });

  it('rechecks capture ownership after confirmation before deleting or changing capture preferences', async () => {
    const { presenter, api, library } = settingsScope();
    presenter.requestClearLibrary();
    (TestBed.inject(CapturePresenter).active as ReturnType<typeof signal<boolean>>).set(true);
    presenter.setSpeechRateIndex(4);

    await presenter.clearLibrary();
    expect(await presenter.save()).toBe(false);
    expect(presenter.form.speechRate().value()).toBe(1);
    expect(api.request).not.toHaveBeenCalled();
    expect(library.saveSettings).not.toHaveBeenCalled();
  });

  it('discards a successful test result when its exact assistant selection changes', async () => {
    // Arrange
    const { presenter, api } = settingsScope();
    api.request.mockImplementation(async (method) => {
      if (method === 'assistant.status') return { ...nativeStatus('codex'), authenticated: true };
      if (method === 'assistant.test') return { text: 'Ready', latencyMs: 1800 };
      return { ok: true };
    });
    await presenter.testAssistant();
    expect(presenter.testResult()).not.toBeNull();

    // Act
    presenter.form.accountId().value.set('another-account');
    TestBed.tick();

    // Assert
    expect(presenter.testResult()).toBeNull();
  });
  it('saves only interface language while capture is active without changing speech or assistant settings', async () => {
    const { presenter, library, settings, api } = settingsScope();
    const capture = TestBed.inject(CapturePresenter);
    (capture.active as ReturnType<typeof signal<boolean>>).set(true);
    presenter.enableAutosave();
    presenter.form.uiLanguage().value.set('de');
    TestBed.tick();
    await Promise.resolve();
    expect(library.saveSettings).toHaveBeenCalledExactlyOnceWith({ uiLanguage: 'de' });
    expect(settings().uiLanguage).toBe('de');
    expect(settings().locale).toBe('de-DE');
    expect(settings().assistant).toEqual(defaultSettings.assistant);
    expect(api.request).not.toHaveBeenCalled();
  });
  it('ignores a delayed old status after a different provider was saved and checked', async () => {
    // Arrange
    const { presenter, api, settings } = settingsScope();
    const old = Promise.withResolvers<Status>();
    api.request.mockImplementation(async (method) =>
      method === 'assistant.status'
        ? settings().assistant.provider === 'codex'
          ? await old.promise
          : nativeStatus('claude')
        : { ok: true },
    );
    const first = presenter.refreshStatus();
    presenter.form.provider().value.set('claude');

    // Act
    const saved = await presenter.save();
    old.resolve(nativeStatus('codex'));
    await first;

    // Assert
    expect(saved).toBe(true);
    expect(presenter.status()?.provider).toBe('claude');
    expect(presenter.checking()).toBe(false);
  });

  it('does not submit a login method from the previously selected provider catalog', async () => {
    // Arrange
    const { presenter, api, library } = settingsScope();
    await presenter.refreshStatus();
    presenter.form.provider().value.set('claude');

    // Act
    await presenter.connect('chatgpt-browser');

    // Assert
    expect(presenter.status()?.provider).toBe('claude');
    expect(api.request.mock.calls.some(([method]) => method === 'assistant.login.start')).toBe(
      false,
    );
    expect(library.report).toHaveBeenCalled();
  });

  it('cancels the old account flow and ignores its late completion while another account is waiting', async () => {
    // Arrange
    const { presenter, api, events } = settingsScope();
    await presenter.connect('chatgpt-browser');
    publish(events, waiting('operation-1', 'old-challenge'));
    presenter.form.accountId().value.set('business');
    await presenter.connect('chatgpt-browser');
    publish(events, waiting('operation-2', 'current-challenge'));

    // Act
    publish(events, { operationId: 'operation-1', state: 'succeeded', authenticated: true });
    presenter.loginForm['authorizationCode']!().value.set('current-one-time-code');
    await presenter.respondLogin();

    // Assert
    expect(api.request).toHaveBeenCalledWith('assistant.login.cancel', {
      operationId: 'operation-1',
    });
    expect(presenter.login()?.operationId).toBe('operation-2');
    expect(presenter.login()?.state).toBe('waiting');
    expect(api.request).toHaveBeenCalledWith('assistant.login.respond', {
      operationId: 'operation-2',
      interactionId: 'current-challenge',
      values: { authorizationCode: 'current-one-time-code' },
    });
    expect(presenter.loginForm['authorizationCode']!().value()).toBe('');
  });

  it('retains the correctly correlated waiting event even when it arrives before the start response', async () => {
    // Arrange
    const { presenter, api, events, settings } = settingsScope();
    api.request.mockImplementation(async (method) => {
      if (method === 'assistant.status') return nativeStatus(settings().assistant.provider);
      if (method === 'assistant.login.start') {
        publish(events, waiting('unrelated-operation', 'wrong-challenge'));
        publish(events, waiting('current-operation', 'right-challenge'));
        return { operationId: 'current-operation' };
      }
      return { ok: true };
    });

    // Act
    await presenter.connect('chatgpt-browser');

    // Assert
    expect(presenter.login()?.operationId).toBe('current-operation');
    expect(presenter.login()?.state).toBe('waiting');
    expect(presenter.login()?.interaction?.id).toBe('right-challenge');
  });

  it('cancels a late-starting native operation after the selected binding changed', async () => {
    // Arrange
    const { presenter, api, settings } = settingsScope();
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<{ operationId: string }>();
    api.request.mockImplementation(async (method) => {
      if (method === 'assistant.status') return nativeStatus(settings().assistant.provider);
      if (method === 'assistant.login.start') {
        started.resolve();
        return await response.promise;
      }
      return { ok: true };
    });
    const connecting = presenter.connect('chatgpt-browser');
    await started.promise;

    // Act
    presenter.form.provider().value.set('claude');
    TestBed.tick();
    response.resolve({ operationId: 'obsolete-operation' });
    await connecting;

    // Assert
    expect(api.request).toHaveBeenCalledWith('assistant.login.cancel', {
      operationId: 'obsolete-operation',
    });
    expect(presenter.login()).toBeNull();
    expect(presenter.status()).toBeNull();
  });

  it('does not submit a current-looking interaction after its provider was edited', async () => {
    // Arrange
    const { presenter, api, events } = settingsScope();
    await presenter.connect('chatgpt-browser');
    publish(events, waiting('operation-1'));
    presenter.loginForm['authorizationCode']!().value.set('must-not-cross-to-another-flow');

    // Act
    presenter.form.provider().value.set('claude');
    await presenter.respondLogin();
    await Promise.resolve();

    // Assert
    expect(api.request.mock.calls.some(([method]) => method === 'assistant.login.respond')).toBe(
      false,
    );
    expect(presenter.login()).toBeNull();
    expect(api.request).toHaveBeenCalledWith('assistant.login.cancel', {
      operationId: 'operation-1',
    });
  });

  it('rejects account identifiers that the native profile owner cannot use before persisting settings', async () => {
    // Arrange
    const { presenter, library } = settingsScope();
    presenter.form.accountId().value.set('name@example.com');

    // Act
    const saved = await presenter.save();

    // Assert
    expect(saved).toBe(false);
    expect(presenter.form.accountId().invalid()).toBe(true);
    expect(library.saveSettings).not.toHaveBeenCalled();
  });

  it('saves only local-account and native-speech settings and can clear a selected system voice', async () => {
    // Arrange
    const { presenter, library, settings } = settingsScope();
    presenter.form.voice().value.set('native-system-voice');
    presenter.form.autoTranscribe().value.set(false);
    presenter.form.conversationInstructions().value.set('Antworte kurz auf Deutsch.');

    // Act
    await presenter.save();
    presenter.form.voice().value.set('default');
    await presenter.save();

    // Assert
    expect(library.saveSettings).toHaveBeenNthCalledWith(1, {
      uiLanguage: 'en',
      appearance: 'system',
      userName: '',
      addressedAs: '',
      autoAnalyze: false,
      showMiniRecorder: false,
      silenceReminder: false,
      markPausesInTranscript: false,
      speechRate: 1,
      audioRetentionDays: 'never',
      context: 'transcriptAndMoments',
      assistant: settings().assistant,
      locale: settings().locale,
      autoTranscribe: false,
      voice: 'native-system-voice',
      conversationInstructions: 'Antworte kurz auf Deutsch.',
    });
    expect(library.saveSettings).toHaveBeenLastCalledWith({
      uiLanguage: 'en',
      appearance: 'system',
      userName: '',
      addressedAs: '',
      autoAnalyze: false,
      showMiniRecorder: false,
      silenceReminder: false,
      markPausesInTranscript: false,
      speechRate: 1,
      audioRetentionDays: 'never',
      context: 'transcriptAndMoments',
      assistant: settings().assistant,
      locale: settings().locale,
      autoTranscribe: false,
      voice: undefined,
      conversationInstructions: 'Antworte kurz auf Deutsch.',
    });
  });

  it('offers browser and device account login while rejecting API-key, token and terminal methods', async () => {
    // Arrange
    const { presenter, api, library } = settingsScope();
    api.request.mockImplementation(async (method) =>
      method === 'assistant.status'
        ? {
            ...nativeStatus('codex'),
            authMethods: [
              ...nativeStatus('codex').authMethods,
              { id: 'chatgpt-device', label: 'Device account login', kind: 'device-code' },
              { id: 'api-key', label: 'API key', kind: 'credentials' },
              { id: 'access-token', label: 'Access token', kind: 'credentials' },
              { id: 'terminal', label: 'Terminal credentials', kind: 'terminal' },
            ],
          }
        : { ok: true },
    );
    await presenter.refreshStatus();

    // Act
    await presenter.connect('api-key');

    // Assert
    expect(presenter.authMethods().map((method) => method.id)).toEqual([
      'chatgpt-browser',
      'chatgpt-device',
    ]);
    expect(api.request.mock.calls.some(([method]) => method === 'assistant.login.start')).toBe(
      false,
    );
    expect(library.report).toHaveBeenCalled();
  });

  it('cancels unexpected credential input even if it arrives during a browser account operation', async () => {
    // Arrange
    const { presenter, api, events } = settingsScope();
    await presenter.connect('chatgpt-browser');

    // Act
    publish(events, {
      operationId: 'operation-1',
      state: 'waiting',
      interaction: {
        id: 'wrong-credentials',
        type: 'credentials',
        expiresAt: Date.now() + 60_000,
        fields: [{ id: 'apiKey', label: 'API key', secret: true, required: true }],
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(presenter.login()?.state).toBe('failed');
    expect(presenter.login()?.interaction).toBeUndefined();
    expect(api.request).toHaveBeenCalledWith('assistant.login.cancel', {
      operationId: 'operation-1',
    });
    expect(api.request.mock.calls.some(([method]) => method === 'assistant.login.respond')).toBe(
      false,
    );
  });

  it('preserves an existing authenticated native account when settings are opened', async () => {
    // Arrange
    const { presenter, api } = settingsScope();
    api.request.mockImplementation(async (method) =>
      method === 'assistant.status'
        ? { ...nativeStatus('codex'), authenticated: true, accountLabel: 'Connected account' }
        : { ok: true },
    );

    // Act
    await presenter.initialize();

    // Assert
    expect(presenter.status()?.authenticated).toBe(true);
    expect(
      api.request.mock.calls.some(([method]) =>
        ['assistant.login.start', 'assistant.logout'].includes(method),
      ),
    ).toBe(false);
  });
});
