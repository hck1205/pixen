/** A point in a 2D cartesian space. Which space is always stated by the caller. */
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Axis-aligned rectangle. `x`/`y` is the top-left corner. */
export interface Rect extends Point, Size {}

/**
 * Affine matrix laid out like the canvas 2D context:
 *
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
