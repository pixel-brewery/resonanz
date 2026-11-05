interface IChapterLabelAnchor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface IMarkerObstacle {
  readonly x: number;
  readonly y: number;
}

interface IChapterLabelBubble {
  readonly id: string;
  readonly index: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface IChapterLabelLayout {
  readonly mode: 'titles' | 'numbers' | 'select';
  readonly bubbles: readonly IChapterLabelBubble[];
}

const safeInset = 8;
const bubbleGap = 6;

/**
 * Places chapter controls inside the measured square without overlapping hit areas.
 *
 * Anchors use the timeline's -55…655 SVG coordinates. Bubble coordinates are CSS
 * pixels; each index retains its zero-based position in the supplied chapter list.
 * Title controls also leave the central context square and its gap unobstructed.
 * Both control sizes avoid actual marker hit circles. Unusable obstacle geometry
 * falls back to a select instead of silently ignoring a potentially covered marker.
 *
 * @public
 * @param anchors - Chapter identities and their radial anchor points.
 * @param side - The measured square's side in CSS pixels.
 * @param markerObstacles - Actual marker centers in the same SVG coordinates.
 * @returns Bounded title or number controls, or a select fallback when neither fits.
 */
export function chapterLabelLayout(
  anchors: readonly IChapterLabelAnchor[],
  side: number,
  markerObstacles: readonly IMarkerObstacle[] = [],
): IChapterLabelLayout {
  if (!anchors.length) return { mode: 'titles', bubbles: [] };
  if (
    !Number.isFinite(side) ||
    side <= 0 ||
    anchors.some((anchor) => !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))
  ) {
    return { mode: 'select', bubbles: [] };
  }

  const obstacles = markerObstacles.map((point) => ({
    x: (side * (point.x + 55)) / 710,
    y: (side * (point.y + 55)) / 710,
  }));
  if (obstacles.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return { mode: 'select', bubbles: [] };
  }
  const markerRadius = (side / 710) * 14;

  const titles = placeBubbles(anchors, side, Math.min(144, Math.max(104, side * 0.24)), 30);
  if (
    titles &&
    !overlapsCenter(titles, side) &&
    !overlapsMarkers(titles, obstacles, markerRadius)
  ) {
    return { mode: 'titles', bubbles: titles };
  }

  const numbers = placeBubbles(anchors, side, 32, 32);
  return numbers && !overlapsMarkers(numbers, obstacles, markerRadius)
    ? { mode: 'numbers', bubbles: numbers }
    : { mode: 'select', bubbles: [] };
}

function overlapsMarkers(
  bubbles: readonly IChapterLabelBubble[],
  obstacles: readonly IMarkerObstacle[],
  radius: number,
): boolean {
  return bubbles.some((bubble) =>
    obstacles.some((point) => {
      const nearestX = Math.min(
        bubble.left + bubble.width + bubbleGap,
        Math.max(bubble.left - bubbleGap, point.x),
      );
      const nearestY = Math.min(
        bubble.top + bubble.height + bubbleGap,
        Math.max(bubble.top - bubbleGap, point.y),
      );
      return Math.hypot(point.x - nearestX, point.y - nearestY) <= radius;
    }),
  );
}

function overlapsCenter(bubbles: readonly IChapterLabelBubble[], side: number): boolean {
  const centerStart = side * 0.2675;
  const centerEnd = centerStart + side * 0.465;
  return bubbles.some(
    (bubble) =>
      bubble.left - bubbleGap < centerEnd &&
      bubble.left + bubble.width + bubbleGap > centerStart &&
      bubble.top - bubbleGap < centerEnd &&
      bubble.top + bubble.height + bubbleGap > centerStart,
  );
}

function placeBubbles(
  anchors: readonly IChapterLabelAnchor[],
  side: number,
  width: number,
  height: number,
): readonly IChapterLabelBubble[] | null {
  if (side < width + safeInset * 2 || side < height + safeInset * 2) return null;

  const bubbles = anchors.map((anchor, index) => ({
    id: anchor.id,
    index,
    left: Math.min(
      side - safeInset - width,
      Math.max(safeInset, (side * (anchor.x + 55)) / 710 - width / 2),
    ),
    top: Math.min(
      side - safeInset - height,
      Math.max(safeInset, (side * (anchor.y + 55)) / 710 - height / 2),
    ),
    width,
    height,
  }));

  const overlaps = bubbles.some((bubble, index) =>
    bubbles
      .slice(index + 1)
      .some(
        (other) =>
          bubble.left < other.left + other.width + bubbleGap &&
          bubble.left + bubble.width + bubbleGap > other.left &&
          bubble.top < other.top + other.height + bubbleGap &&
          bubble.top + bubble.height + bubbleGap > other.top,
      ),
  );
  return overlaps ? null : bubbles;
}
