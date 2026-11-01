import { describe, expect, it } from 'vitest';
import { CapturePauseTracker } from './CapturePauseTracker';
import type { ICapturePauseEvent } from './ICapturePauseEvent';

describe('CapturePauseTracker', () => {
  it('records one actual media offset and the excluded monotonic wall duration without inventing speech', () => {
    const tracker = new CapturePauseTracker();
    const events: ICapturePauseEvent[] = [];
    tracker.events.subscribe((event) => events.push(event));
    tracker.begin('capture', 12000, 50000);
    tracker.begin('capture', 13000, 51000);
    tracker.end(230000.5);
    tracker.end(240000);
    expect(events).toHaveLength(2);
    expect(events[0]?.pause.durationMs).toBeUndefined();
    expect(events[1]).toEqual({
      sessionId: 'capture',
      pause: { id: events[0]?.pause.id, atMs: 12000, durationMs: 180000.5 },
    });
    expect(events[1]?.pause).not.toHaveProperty('text');
  });
  it('retains multiday wall duration independently of media offset and does not infer a lost end', () => {
    const tracker = new CapturePauseTracker();
    const events: ICapturePauseEvent[] = [];
    tracker.events.subscribe((event) => events.push(event));
    tracker.begin('first-capture', 1000, 10000);
    tracker.reset();
    tracker.begin('next-capture', 500, 20000);
    tracker.end(20000 + 2 * 86400000);
    expect(events).toHaveLength(3);
    expect(events[0]?.pause.durationMs).toBeUndefined();
    expect(events[2]?.pause.durationMs).toBe(2 * 86400000);
    expect(events[2]?.pause.atMs).toBe(500);
  });
});
