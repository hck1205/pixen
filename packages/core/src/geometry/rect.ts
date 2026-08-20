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



export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(right(a), right(b)) - x, height: Math.max(bottom(a), bottom(b)) - y };
}


/** Axis-aligned bounding box of `r` after `m` is applied. */
export function transformBounds(m: Matrix, r: Rect): Rect {
  return boundsOf(corners(r).map((p) => applyToPoint(m, p)));
}

/**
 * The axis-aligned box a set of points sits in.
 *
 * An empty set has no box, and the zero rect is the honest answer: there is
 * nothing to bound, and every caller here treats a zero-size layer as one with
 * nothing in it.
 */
export function boundsOf(points: readonly Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
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
  const scale = Math.min(1, fitScale(size, limit, "contain"));
  return roundedSize(size.width * scale, size.height * scale);
}

/**
 * The largest size of this shape that fits within a pixel budget.
 *
 * A canvas is not refused for being wide or tall but for the pixels in it, and
 * what a browser will actually allocate is far below what the specification
 * allows — low enough on some phones that an ordinary photograph from the same
 * phone does not fit. The failure is the bad part: an over-large canvas comes
 * back blank or transparent rather than throwing, so the picture is simply
 * wrong, and nothing says why.
 *
 * Scaling both axes by the square root of the ratio is what keeps the shape
 * while actually spending the budget — a picture cut to a tenth of the pixels
 * is not a tenth as wide.
 *
 * What guarantees the result is the pair of caps rather than the scaling: each
 * axis is limited to what the budget leaves for it, so even a shape too long to
 * fit at all comes back inside the budget rather than merely smaller. The shape
 * is what gets given up in that case; the budget is not negotiable. Flooring on
 * top of that keeps each axis from creeping over its share by a pixel.
 */
export function fitWithinPixels(size: Size, maxPixels: number): Size {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  if (!Number.isFinite(maxPixels) || maxPixels < 1 || width * height <= maxPixels) return { width, height };

  const scale = Math.sqrt(maxPixels / (width * height));
  // Each axis is capped against what is left for it, because scaling alone is
  // not enough at the extremes: a strip 65,535 pixels wide against a budget of
  // one scales to 147 wide and one tall, which is 147 times over.
  const fittedWidth = Math.max(1, Math.min(Math.floor(width * scale), Math.floor(maxPixels)));
  return {
    width: fittedWidth,
    height: Math.max(1, Math.min(Math.floor(height * scale), Math.floor(maxPixels / fittedWidth))),
  };
}

/**
 * The longer of a size's two edges.
 *
 * The measure almost every fraction in the model is expressed against — a
 * stroke width, a frame inset, a watermark's scale, a redaction's strength —
 * so that one setting suits a thumbnail and a 6000px export alike. Eleven
 * places wrote the `Math.max` out, several of them into a variable already
 * called `longestEdge`.
 */
export function longestEdge(size: Size): number {
  return Math.max(size.width, size.height);
}

/**
 * A size a canvas can actually be: whole pixels, and never nothing.
 *
 * Seven places rounded and floored a pair of numbers by hand. A zero-width
 * surface is not an error anyone reports — it is a blank export — so the floor
 * matters more than the rounding does.
 */
export function roundedSize(width: number, height: number): Size {
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/**
 * How much to scale `size` so it sits inside `box`, or covers it.
 *
 * The two are the same ratio with a different reducer, which is why they are one
 * function: `contain` takes the smaller of the two axes so nothing sticks out,
 * `cover` takes the larger so nothing is left uncovered.
 */
export function fitScale(size: Size, box: Size, mode: "contain" | "cover"): number {
  const horizontal = box.width / size.width;
  const vertical = box.height / size.height;
  return mode === "contain" ? Math.min(horizontal, vertical) : Math.max(horizontal, vertical);
}
