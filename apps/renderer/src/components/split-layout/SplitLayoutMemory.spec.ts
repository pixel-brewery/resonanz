import { describe, expect, it } from 'vitest';
import { SplitLayoutMemory } from './SplitLayoutMemory';

describe('SplitLayoutMemory', () => {
  it('keeps pane identities and pixel/ratio preferences independent', () => {
    const values = new Map<string, string>();
    const memory = new SplitLayoutMemory({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    });
    memory.remember('navigation', 242.5, 'px');
    memory.remember('comparison', 44, '%');
    expect(memory.read('navigation', 'px')).toBe(242.5);
    expect(memory.read('comparison', '%')).toBe(44);
    expect(memory.read('comparison', 'px')).toBeUndefined();
    expect(memory.read('other', 'px')).toBeUndefined();
  });

  it('rejects corrupt or collapsed sizes without replacing a usable preference', () => {
    let stored = '280';
    const memory = new SplitLayoutMemory({
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value;
      },
    });
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      memory.remember('pane', invalid, 'px');
      expect(stored).toBe('280');
    }
    for (const invalid of ['', '   ', 'Infinity', 'NaN', '-8', '0', '280px']) {
      stored = invalid;
      expect(memory.read('pane', 'px')).toBeUndefined();
    }
    for (const invalid of ['100', '120']) {
      stored = invalid;
      expect(memory.read('pane', '%')).toBeUndefined();
    }
  });

  it('supports resizing when storage is absent, denied or full', () => {
    const denied = () => {
      throw new Error('Storage unavailable');
    };
    for (const storage of [undefined, { getItem: denied, setItem: denied }]) {
      const memory = new SplitLayoutMemory(storage);
      expect(memory.read('pane', 'px')).toBeUndefined();
      expect(() => memory.remember('pane', 300, 'px')).not.toThrow();
    }
  });
});
