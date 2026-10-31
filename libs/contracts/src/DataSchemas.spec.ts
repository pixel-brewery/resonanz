// #region Imports
import { describe, expect, it } from 'vitest';
import { dataSchemas } from './DataSchemas.js';
import { requestSchemas } from './RequestSchemas.js';
// #endregion

describe('keyless persisted preferences', () => {
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
    expect(settings.conversationInstructions).toContain('Gesprächspartner');
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
});
