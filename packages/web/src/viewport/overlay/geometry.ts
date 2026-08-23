import type { Point, Rect } from "@pixen/core";

/**
 * Where the overlay's lines go, as data rather than as drawing calls.
 *
 * Keeping the rule-of-thirds spacing and the corner bracket lengths here means
 * they are answerable in a unit test, and the drawing next door is left with a
 * loop over line segments.
 */
export interface Segment {
  from: Point;
  to: Point;
}

/** Rule-of-thirds guides inside `rect`. */
export function gridSegments(rect: Rect, divisions = 3): Segment[] {
  const segments: Segment[] = [];
  for (let i = 1; i < divisions; i += 1) {
    const x = rect.x + (rect.width * i) / divisions;
    const y = rect.y + (rect.height * i) / divisions;
    segments.push({ from: { x, y: rect.y }, to: { x, y: rect.y + rect.height } });
    segments.push({ from: { x: rect.x, y }, to: { x: rect.x + rect.width, y } });
  }
  return segments;
}

export const CORNER_ARM = 22;

/**
 * Corner brackets: two arms per corner, pointing inwards. The arm is capped at a
 * third of the rect so the brackets never meet on a small crop.
 */
export function cornerSegments(rect: Rect, arm = CORNER_ARM): Segment[] {
  const length = Math.min(arm, rect.width / 3, rect.height / 3);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  const corners: Array<{ point: Point; dx: number; dy: number }> = [
    { point: { x: rect.x, y: rect.y }, dx: 1, dy: 1 },
    { point: { x: right, y: rect.y }, dx: -1, dy: 1 },
    { point: { x: right, y: bottom }, dx: -1, dy: -1 },
    { point: { x: rect.x, y: bottom }, dx: 1, dy: -1 },
  ];

  return corners.flatMap(({ point, dx, dy }) => [
    { from: { x: point.x + length * dx, y: point.y }, to: point },
    { from: point, to: { x: point.x, y: point.y + length * dy } },
  ]);
}

/** Maps a stage-space rect into device pixels through the view transform. */
export function projectRect(
  rect: Rect,
  toScreen: (point: Point) => Point,
  devicePixelRatio: number,
): Rect {
  const topLeft = toScreen({ x: rect.x, y: rect.y });
  const bottomRight = toScreen({ x: rect.x + rect.width, y: rect.y + rect.height });
  return {
    x: topLeft.x * devicePixelRatio,
    y: topLeft.y * devicePixelRatio,
    width: (bottomRight.x - topLeft.x) * devicePixelRatio,
    height: (bottomRight.y - topLeft.y) * devicePixelRatio,
  };
}
