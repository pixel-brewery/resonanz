import { describe, expect, it } from 'vitest';
import { timelineRatio, waveformBins, arcPath } from './VisualizationModels';
describe('visualization data boundaries', () => {
  it('preserves measured peaks while keeping missing, silent and malformed samples finite', () => {
    expect(waveformBins([], 36)).toEqual(Array.from({ length: 36 }, () => 0));
    expect(Math.max(...waveformBins([0, 0, 1, 0, 0], 2))).toBe(1);
    expect(waveformBins([NaN, Infinity, -2, 5], 4)).toEqual([0, 0, 0, 1]);
    expect(timelineRatio(1000, 0)).toBe(0);
    expect(timelineRatio(-1, 1000)).toBe(0);
    expect(timelineRatio(9999, 1000)).toBe(1);
    expect(arcPath(0, 1, 295)).not.toMatch(/NaN|Infinity/u);
  });
});
