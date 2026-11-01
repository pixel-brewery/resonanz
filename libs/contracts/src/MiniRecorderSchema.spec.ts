import { describe, expect, it } from 'vitest';
import {
  initialMiniRecorderSnapshot,
  miniRecorderActionSchema,
  miniRecorderSchema,
} from './MiniRecorderSchema.js';

describe('passive mini recorder contracts', () => {
  it('requires an active capture identity and bounds the passive presentation payload', () => {
    expect(miniRecorderSchema.parse(initialMiniRecorderSnapshot).active).toBe(false);
    const snapshot = {
      ...initialMiniRecorderSnapshot,
      active: true,
      sessionId: crypto.randomUUID(),
      visible: true,
    };
    expect(miniRecorderSchema.parse(snapshot).sessionId).toBe(snapshot.sessionId);
    expect(miniRecorderSchema.safeParse({ ...snapshot, sessionId: null }).success).toBe(false);
    expect(miniRecorderSchema.safeParse({ ...snapshot, level: Infinity }).success).toBe(false);
    expect(miniRecorderSchema.safeParse({ ...snapshot, durationMs: 86_400_001 }).success).toBe(
      false,
    );
    expect(
      miniRecorderSchema.safeParse({ ...snapshot, credentials: 'not part of this surface' })
        .success,
    ).toBe(false);
  });
  it('allows capture controls bound to a session without arbitrary methods or native dimensions', () => {
    const sessionId = crypto.randomUUID();
    expect(miniRecorderActionSchema.parse({ sessionId, action: 'undo' })).toEqual({
      sessionId,
      action: 'undo',
    });
    expect(
      miniRecorderActionSchema.safeParse({ sessionId, action: 'assistant.login.start' }).success,
    ).toBe(false);
    expect(
      miniRecorderActionSchema.safeParse({ sessionId, action: 'mark', width: 4096 }).success,
    ).toBe(false);
  });
});
