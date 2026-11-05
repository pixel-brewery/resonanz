import { describe, expect, it } from 'vitest';
import { chapterLabelLayout } from './chapterLabelLayout';

function ringAnchors(count: number): readonly { id: string; x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (((index + 0.5) / count) * 2 - 0.5) * Math.PI;
    return {
      id: `chapter-${index}`,
      x: 300 + Math.cos(angle) * 326,
      y: 300 + Math.sin(angle) * 326,
    };
  });
}

function expectBoundedAndSeparated(
  layout: ReturnType<typeof chapterLabelLayout>,
  side: number,
): void {
  for (const [index, bubble] of layout.bubbles.entries()) {
    expect([bubble.left, bubble.top, bubble.width, bubble.height].every(Number.isFinite)).toBe(
      true,
    );
    expect(bubble.width).toBeGreaterThan(0);
    expect(bubble.height).toBeGreaterThan(0);
    expect(bubble.left).toBeGreaterThanOrEqual(8);
    expect(bubble.top).toBeGreaterThanOrEqual(8);
    expect(bubble.left + bubble.width).toBeLessThanOrEqual(side - 8);
    expect(bubble.top + bubble.height).toBeLessThanOrEqual(side - 8);
    for (const other of layout.bubbles.slice(index + 1)) {
      expect(
        bubble.left + bubble.width + 6 <= other.left ||
          other.left + other.width + 6 <= bubble.left ||
          bubble.top + bubble.height + 6 <= other.top ||
          other.top + other.height + 6 <= bubble.top,
      ).toBe(true);
    }
  }
  if (layout.mode === 'titles') expectCenterClear(layout, side);
}

function expectCenterClear(layout: ReturnType<typeof chapterLabelLayout>, side: number): void {
  const centerStart = side * 0.2675;
  const centerEnd = centerStart + side * 0.465;
  for (const bubble of layout.bubbles) {
    expect(
      bubble.left + bubble.width + 6 <= centerStart ||
        bubble.left - 6 >= centerEnd ||
        bubble.top + bubble.height + 6 <= centerStart ||
        bubble.top - 6 >= centerEnd,
    ).toBe(true);
  }
}

describe('chapter label layout', () => {
  it('maps the SVG viewBox offset into the measured stage before centering a bubble', () => {
    const layout = chapterLabelLayout([{ id: 'one', x: 100, y: 400 }], 710);
    const bubble = layout.bubbles[0];

    expect(bubble).toBeDefined();
    if (!bubble) return;
    expect(bubble.left + bubble.width / 2).toBe(155);
    expect(bubble.top + bubble.height / 2).toBe(455);
  });

  it('keeps seven title hit areas inside the radial stage with separation', () => {
    const layout = chapterLabelLayout(ringAnchors(7), 710);

    expect(layout.mode).toBe('titles');
    expect(layout.bubbles).toHaveLength(7);
    expectBoundedAndSeparated(layout, 710);
  });

  it('uses numbered controls when seven titles collide after a compact resize', () => {
    const layout = chapterLabelLayout(ringAnchors(7), 260);

    expect(layout.mode).toBe('numbers');
    expect(layout.bubbles).toHaveLength(7);
    expectBoundedAndSeparated(layout, 260);
  });

  it.each([
    { side: 344, mode: 'numbers' },
    { side: 710, mode: 'titles' },
  ])('keeps six chapters clear of the center context at side $side', ({ side, mode }) => {
    const layout = chapterLabelLayout(ringAnchors(6), side);

    expect(layout.mode).toBe(mode);
    expect(layout.bubbles).toHaveLength(6);
    expectBoundedAndSeparated(layout, side);
    expectCenterClear(layout, side);
  });

  it.each([
    { direction: 'east', anchorX: 626, markerX: 572 },
    { direction: 'west', anchorX: -26, markerX: 28 },
  ])(
    'replaces titles covering an actual $direction marker with numbers',
    ({ anchorX, markerX }) => {
      const anchors = [{ id: 'one', x: anchorX, y: 300 }];
      const baseline = chapterLabelLayout(anchors, 710);
      const layout = chapterLabelLayout(anchors, 710, [{ x: markerX, y: 300 }]);

      expect(baseline.mode).toBe('titles');
      expect(layout.mode).toBe('numbers');
      expect(layout.bubbles).toHaveLength(1);
      expectBoundedAndSeparated(layout, 710);
    },
  );

  it('uses a select when a compact number would cover an actual marker hit area', () => {
    const anchors = ringAnchors(6);
    const baseline = chapterLabelLayout(anchors, 344);
    const layout = chapterLabelLayout(anchors, 344, [{ x: 572, y: 300 }]);

    expect(baseline.mode).toBe('numbers');
    expect(layout).toEqual({ mode: 'select', bubbles: [] });
  });

  it.each([
    { side: 710, count: 7 },
    { side: 344, count: 6 },
  ])('preserves unobstructed controls when markers are away at side $side', ({ side, count }) => {
    const anchors = ringAnchors(count);
    const baseline = chapterLabelLayout(anchors, side);

    expect(chapterLabelLayout(anchors, side, [{ x: 300, y: 28 }])).toEqual(baseline);
    expect(chapterLabelLayout(anchors, side, [])).toEqual(baseline);
  });

  it.each([
    { boundary: 'outside edge', x: 482.99, y: 300, mode: 'titles' },
    { boundary: 'tangent edge', x: 483, y: 300, mode: 'numbers' },
    { boundary: 'inside edge', x: 483.01, y: 300, mode: 'numbers' },
    { boundary: 'outside rounded corner', x: 487, y: 269, mode: 'titles' },
    { boundary: 'inside rounded corner', x: 487.2, y: 269.2, mode: 'numbers' },
  ])('respects the circular hit boundary and gap: $boundary', ({ x, y, mode }) => {
    const layout = chapterLabelLayout([{ id: 'east', x: 626, y: 300 }], 710, [{ x, y }]);

    expect(layout.mode).toBe(mode);
    expectBoundedAndSeparated(layout, 710);
  });

  it.each([
    { markerX: 548.98, mode: 'numbers' },
    { markerX: 549, mode: 'select' },
  ])(
    'scales the marker hit radius with the actual stage at marker x $markerX',
    ({ markerX, mode }) => {
      const layout = chapterLabelLayout([{ id: 'east', x: 626, y: 300 }], 355, [
        { x: markerX, y: 300 },
      ]);

      expect(layout.mode).toBe(mode);
      expectBoundedAndSeparated(layout, 355);
    },
  );

  it.each([
    { x: NaN, y: 300 },
    { x: 300, y: Infinity },
    { x: -Infinity, y: 300 },
    { x: Number.MAX_VALUE, y: 300 },
  ])('uses a select when an obstacle cannot provide usable hit geometry: %s', (point) => {
    expect(chapterLabelLayout(ringAnchors(7), 710, [point])).toEqual({
      mode: 'select',
      bubbles: [],
    });
  });

  it('uses one select instead of overlapping controls for a dense chapter cluster', () => {
    const anchors = Array.from({ length: 100 }, (_, index) => ({
      id: `cluster-${index}`,
      x: 300,
      y: 300,
    }));

    expect(chapterLabelLayout(anchors, 710)).toEqual({ mode: 'select', bubbles: [] });
  });

  it.each([
    { distance: 34, mode: 'select' },
    { distance: 38, mode: 'numbers' },
  ])('requires a gap between neighboring hit areas at distance $distance', ({ distance, mode }) => {
    const layout = chapterLabelLayout(
      [
        { id: 'one', x: 300, y: 300 },
        { id: 'two', x: 300 + distance, y: 300 },
      ],
      710,
    );

    expect(layout.mode).toBe(mode);
    expectBoundedAndSeparated(layout, 710);
  });

  it('clamps the whole hit area at every edge even for finite anchors beyond the SVG', () => {
    const anchors = [
      { id: 'top-left', x: -1_000_000, y: -1_000_000 },
      { id: 'top-right', x: 1_000_000, y: -1_000_000 },
      { id: 'bottom-right', x: 1_000_000, y: 1_000_000 },
      { id: 'bottom-left', x: -1_000_000, y: 1_000_000 },
    ];
    const layout = chapterLabelLayout(anchors, 260);

    expect(layout.mode).toBe('titles');
    expect(layout.bubbles).toHaveLength(4);
    expectBoundedAndSeparated(layout, 260);
  });

  it('uses a complete numbered control at the smallest usable stage size', () => {
    const layout = chapterLabelLayout([{ id: 'one', x: 300, y: 300 }], 48);

    expect(layout.mode).toBe('numbers');
    expect(layout.bubbles).toHaveLength(1);
    expectBoundedAndSeparated(layout, 48);
  });

  it.each([47, Number.MIN_VALUE, 0, -1, NaN, Infinity, -Infinity])(
    'falls back without invalid or partial hit areas for side %s',
    (side) => {
      expect(chapterLabelLayout([{ id: 'one', x: 300, y: 300 }], side)).toEqual({
        mode: 'select',
        bubbles: [],
      });
    },
  );

  it.each([
    { x: NaN, y: 300 },
    { x: 300, y: Infinity },
    { x: -Infinity, y: 300 },
  ])('keeps malformed anchor coordinates out of CSS geometry: %s', (point) => {
    expect(chapterLabelLayout([{ id: 'one', ...point }], 710)).toEqual({
      mode: 'select',
      bubbles: [],
    });
  });

  it('does not offer an empty select before measurement or when no chapters exist', () => {
    expect(chapterLabelLayout([], 0)).toEqual({ mode: 'titles', bubbles: [] });
    expect(chapterLabelLayout([], 710)).toEqual({ mode: 'titles', bubbles: [] });
  });

  it('retains source identities and indices deterministically without mutating frozen anchors', () => {
    const anchors = Object.freeze(
      ringAnchors(7)
        .toReversed()
        .map((anchor) => Object.freeze(anchor)),
    );
    const original = anchors.map((anchor) => ({ ...anchor }));
    const layout = chapterLabelLayout(anchors, 710);

    expect(layout).toEqual(chapterLabelLayout(anchors, 710));
    expect(layout.bubbles.map(({ id, index }) => ({ id, index }))).toEqual(
      anchors.map((anchor, index) => ({ id: anchor.id, index })),
    );
    expect(anchors).toEqual(original);
  });
});
