// #region Imports
import { describe, expect, it } from 'vitest';
import { parseAudioRange } from './parseAudioRange.js';
// #endregion

describe('parseAudioRange', () => {
  it('serves complete, bounded, open-ended and suffix requests without reading outside the file', () => {
    // arrange / act / assert
    expect(parseAudioRange(null, 100)).toEqual({ start: 0, end: 99, partial: false });
    expect(parseAudioRange('bytes=10-20', 100)).toEqual({ start: 10, end: 20, partial: true });
    expect(parseAudioRange('bytes=90-', 100)).toEqual({ start: 90, end: 99, partial: true });
    expect(parseAudioRange('bytes=-20', 100)).toEqual({ start: 80, end: 99, partial: true });
    expect(parseAudioRange('bytes=80-500', 100)).toEqual({ start: 80, end: 99, partial: true });
  });
  it('rejects impossible, compound, overflowing and malformed ranges', () => {
    // arrange / act / assert
    for (const header of [
      'bytes=100-',
      'bytes=30-20',
      'bytes=0-1,5-8',
      'bytes=-0',
      'bytes=-',
      'bytes=1e3-',
      'bytes=9007199254740993-',
    ])
      expect(parseAudioRange(header, 100)).toBeNull();
    expect(parseAudioRange(null, 0)).toBeNull();
  });
});
