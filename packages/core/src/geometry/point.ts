import type { Point } from "./types.js";

/**
 * Point arithmetic.
 *
 * The smallest module in `geometry/`, and the last one written — which is how
 * six copies of `Math.hypot(b.x - a.x, b.y - a.y)` came to be spread across the
 * gesture reducer, the hit tester and the renderer. One-liners are precisely
 * what the duplication scan cannot see: it looks for four repeated lines, and
 * none of these is more than one. That is what a reading pass is for.
 */

/** How far it is from `from` to `to`. Named for the direction, so it reads. */
export function delta(from: Point, to: Point): Point {
  return { x: to.x - from.x, y: to.y - from.y };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
