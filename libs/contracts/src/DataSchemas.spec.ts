// #region Imports
import { describe, expect, it } from 'vitest';
import { dataSchemas } from './DataSchemas.js';
import { requestSchemas } from './RequestSchemas.js';
// #endregion

describe('keyless persisted preferences', () => {
  it('keeps automatic analysis deadlines host-owned and validates tray size intents', () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    expect(
      requestSchemas['sessions.pipeline'].safeParse({
        sessionId,
        stage: 'analysis',
        step: { state: 'failed', retryAt: new Date(0).toISOString() },
      }).success,
    ).toBe(false);
    expect(requestSchemas['window.tray.resize'].parse({ height: 580 })).toEqual({ height: 580 });
    for (const height of [0, 4097, 300.5, Number.POSITIVE_INFINITY])
      expect(requestSchemas['window.tray.resize'].safeParse({ height }).success).toBe(false);
  });
  it('loads an earlier catalog without losing its native assistant binding', () => {
    const settings = dataSchemas.settings.parse({
      assistant: { provider: 'codex', accountId: 'native-account', model: 'selected-model' },
      locale: 'de-DE',
      transcriptionProvider: 'openai',
      transcriptionModel: 'old-cloud-model',
      realtimeModel: 'old-live-model',
      realtimeVoice: 'marin',
      realtimeInstructions: 'obsolete delegation',
    });
    expect(settings.assistant).toEqual({
      provider: 'codex',
      accountId: 'native-account',
      model: 'selected-model',
    });
    expect(settings.autoTranscribe).toBe(true);
    expect(settings.conversationInstructions).toContain('conversation partner');
    expect(Object.keys(settings)).not.toContain('realtimeModel');
    expect(Object.keys(settings)).not.toContain('transcriptionProvider');
    expect(Object.keys(requestSchemas)).not.toContain('credentials.set');
    expect(Object.keys(requestSchemas)).not.toContain('live.exchange');
  });
  it('allows clearing a selected system voice while rejecting secret configuration', () => {
    expect(requestSchemas['settings.save'].parse({ voice: undefined })).toEqual({
      voice: undefined,
    });
    expect(() => requestSchemas['settings.save'].parse({ apiKey: 'not-admitted' })).toThrow();
  });
  it('admits native pacing and explicit retention choices without resetting untouched older preferences', () => {
    expect(
      requestSchemas['settings.save'].parse({
        speechRate: 0.8,
        audioRetentionDays: 90,
        silenceReminder: true,
        markPausesInTranscript: true,
      }),
    ).toEqual({
      speechRate: 0.8,
      audioRetentionDays: 90,
      silenceReminder: true,
      markPausesInTranscript: true,
    });
    expect(requestSchemas['settings.save'].parse({ uiLanguage: 'de' })).toEqual({
      uiLanguage: 'de',
    });
    for (const speechRate of [0.49, 2.01, Number.NaN, Number.POSITIVE_INFINITY])
      expect(requestSchemas['settings.save'].safeParse({ speechRate }).success).toBe(false);
    expect(requestSchemas['settings.save'].safeParse({ audioRetentionDays: 1 }).success).toBe(
      false,
    );
    expect(requestSchemas['settings.save'].safeParse({ audioRetentionDays: '30' }).success).toBe(
      false,
    );
    expect(requestSchemas['sessions.clear'].safeParse({}).success).toBe(false);
    expect(requestSchemas['sessions.clear'].safeParse({ confirm: false }).success).toBe(false);
  });
  it('rejects inconsistent measured storage totals at the IPC response boundary', () => {
    const usage = {
      measuredAt: new Date(0).toISOString(),
      audioBytes: 40,
      transcriptBytes: 3,
      analysisBytes: 5,
      metadataBytes: 2,
      totalBytes: 50,
      sessionCount: 1,
    };
    expect(dataSchemas.storageUsage.parse(usage)).toEqual(usage);
    expect(dataSchemas.storageUsage.safeParse({ ...usage, totalBytes: 49 }).success).toBe(false);
    expect(dataSchemas.storageUsage.safeParse({ ...usage, metadataBytes: -2 }).success).toBe(false);
  });
});
