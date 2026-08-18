import { applyToPoint } from "./matrix.js";
import type { Matrix, Point, Rect, Size } from "./types.js";

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function rectFromSize(size: Size): Rect {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

export function right(r: Rect): number {
  return r.x + r.width;
}

export function bottom(r: Rect): number {
  return r.y + r.height;
}

export function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function area(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

export function corners(r: Rect): [Point, Point, Point, Point] {
  return [
    { x: r.x, y: r.y },
    { x: right(r), y: r.y },
    { x: right(r), y: bottom(r) },
    { x: r.x, y: bottom(r) },
  ];
}

export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= right(r) && p.y >= r.y && p.y <= bottom(r);
}

export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(right(a), right(b)) - x;
  const h = Math.min(bottom(a), bottom(b)) - y;
  return { x, y, width: Math.max(0, w), height: Math.max(0, h) };
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(right(a), right(b)) - x, height: Math.max(bottom(a), bottom(b)) - y };
}

export function rectEquals(a: Rect, b: Rect, epsilon = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  );
}

/** Axis-aligned bounding box of `r` after `m` is applied. */
export function transformBounds(m: Matrix, r: Rect): Rect {
  const points = corners(r).map((p) => applyToPoint(m, p));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/**
 * Size of the axis-aligned bounding box of `size` rotated by `radians`.
 *
 * Quarter turns are snapped: `Math.cos(Math.PI / 2)` is 6.1e-17, not 0, and left
 * alone that residue turns a 90 degree rotation of a 400x200 image into a
 * 200.00000000000003 wide stage — a drift that then leaks into crop rects,
 * export sizes and saved documents.
 */
export function rotatedBounds(size: Size, radians: number): Size {
  const cos = snapToAxis(Math.abs(Math.cos(radians)));
  const sin = snapToAxis(Math.abs(Math.sin(radians)));
  return {
    width: size.width * cos + size.height * sin,
    height: size.width * sin + size.height * cos,
  };
}

const AXIS_EPSILON = 1e-12;

function snapToAxis(value: number): number {
  if (value < AXIS_EPSILON) return 0;
  if (value > 1 - AXIS_EPSILON) return 1;
  return value;
}

/** Largest rect with `aspectRatio` that fits inside `bounds`, centered. */
export function fitAspectRatio(bounds: Size, aspectRatio: number): Rect {
  const boundsRatio = bounds.width / bounds.height;
  let width: number;
  let height: number;
  if (boundsRatio > aspectRatio) {
    height = bounds.height;
    width = height * aspectRatio;
  } else {
    width = bounds.width;
    height = width / aspectRatio;
  }
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
}

/** Smallest rect with `aspectRatio` that covers `bounds`, centered (may overflow). */
export function coverAspectRatio(bounds: Size, aspectRatio: number): Rect {
  const boundsRatio = bounds.width / bounds.height;
  let width: number;
  let height: number;
  if (boundsRatio > aspectRatio) {
    width = bounds.width;
    height = width / aspectRatio;
  } else {
    height = bounds.height;
    width = height * aspectRatio;
  }
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
}

/**
 * Moves `r` so it sits inside `bounds` without resizing it. If `r` is larger than
 * `bounds` on an axis it is centered on that axis instead.
 */
export function clampInside(r: Rect, bounds: Rect): Rect {
  let { x, y } = r;
  if (r.width >= bounds.width) {
    x = bounds.x + (bounds.width - r.width) / 2;
  } else {
    x = Math.min(Math.max(x, bounds.x), right(bounds) - r.width);
  }
  if (r.height >= bounds.height) {
    y = bounds.y + (bounds.height - r.height) / 2;
  } else {
    y = Math.min(Math.max(y, bounds.y), bottom(bounds) - r.height);
  }
  return { x, y, width: r.width, height: r.height };
}

/**
 * Shrinks `r` (keeping its aspect ratio when one is given) until it fits inside
 * `bounds`, then moves it inside. Used to keep a crop rect legal after any edit.
 */
export function constrainRect(
  r: Rect,
  bounds: Rect,
  options: { aspectRatio?: number | null; minSize?: number } = {},
): Rect {
  const minSize = options.minSize ?? 1;
  const aspectRatio = options.aspectRatio ?? null;

  let width = Math.max(minSize, r.width);
  let height = Math.max(minSize, r.height);

  if (aspectRatio) {
    height = width / aspectRatio;
    const fitted = fitAspectRatio(bounds, aspectRatio);
    if (width > fitted.width) {
      width = fitted.width;
      height = fitted.height;
    }
  } else {
    width = Math.min(width, bounds.width);
    height = Math.min(height, bounds.height);
  }

  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return clampInside({ x: cx - width / 2, y: cy - height / 2, width, height }, bounds);
}

/** Scales a size to fit inside `limit`, never scaling up. */
export function scaleToFit(size: Size, limit: Size): Size {
  const scale = Math.min(1, limit.width / size.width, limit.height / size.height);
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}
