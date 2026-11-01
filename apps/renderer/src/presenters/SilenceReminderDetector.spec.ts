import { describe, expect, it } from 'vitest';
import { SilenceReminderDetector } from './SilenceReminderDetector';

function quiet(
  detector: SilenceReminderDetector,
  start: number,
  end: number,
  sessionId = 'capture',
) {
  const reminders: number[] = [];
  for (let atMs = start; atMs <= end; atMs += 1000) {
    if (detector.observe({ sessionId, atMs, rms: 0, eligible: true })) reminders.push(atMs);
  }
  return reminders;
}

describe('SilenceReminderDetector', () => {
  it('requires five continuous measured quiet minutes and prompts once until explicitly continued', () => {
    const detector = new SilenceReminderDetector();
    expect(quiet(detector, 0, 299000)).toEqual([]);
    expect(quiet(detector, 300000, 600000)).toEqual([300000]);
    detector.acknowledge('capture', 600000);
    expect(quiet(detector, 601000, 899000)).toEqual([]);
    expect(quiet(detector, 900000, 901000)).toEqual([900000]);
  });
  it('does not count missing callbacks or a changed capture as measured silence', () => {
    const detector = new SilenceReminderDetector();
    quiet(detector, 0, 299000);
    expect(detector.observe({ sessionId: 'capture', atMs: 400000, rms: 0, eligible: true })).toBe(
      false,
    );
    expect(quiet(detector, 401000, 699000)).toEqual([]);
    expect(quiet(detector, 700000, 700000)).toEqual([700000]);
    expect(quiet(detector, 701000, 1000000, 'another-capture')).toEqual([]);
    expect(quiet(detector, 1001000, 1001000, 'another-capture')).toEqual([1001000]);
  });
  it('restarts the quiet window after measured activity or a paused, muted, speaking or disabled period', () => {
    const detector = new SilenceReminderDetector();
    quiet(detector, 0, 299000);
    expect(
      detector.observe({ sessionId: 'capture', atMs: 300000, rms: 0.02, eligible: true }),
    ).toBe(false);
    expect(quiet(detector, 301000, 599000)).toEqual([]);
    expect(detector.observe({ sessionId: 'capture', atMs: 600000, rms: 0, eligible: false })).toBe(
      false,
    );
    expect(quiet(detector, 601000, 900000)).toEqual([]);
    expect(quiet(detector, 901000, 901000)).toEqual([901000]);
  });
});
