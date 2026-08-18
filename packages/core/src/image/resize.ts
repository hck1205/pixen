import type { Size } from "../geometry/types.js";
import { createSurface, releaseSurface, type Canvas2D } from "./canvas.js";

export interface ResizeIntent {
  /** Hard target; wins over the max/scale hints. */
  width?: number | null;
  height?: number | null;
  maxWidth?: number | null;
  maxHeight?: number | null;
  scale?: number | null;
  /** Never enlarge beyond the source. Default true. */
  preventUpscale?: boolean;
}

/**
 * Resolves a resize intent into concrete output pixels.
 *
 * Rules, in order: an explicit width/height pair wins; a single explicit side
 * scales the other proportionally; otherwise the max hints shrink the image to
 * fit and `scale` multiplies what is left.
 */
export function resolveSize(source: Size, intent: ResizeIntent = {}): Size {
  const ratio = source.width / source.height;
  const preventUpscale = intent.preventUpscale !== false;

  let width: number;
  let height: number;

  if (intent.width != null && intent.height != null) {
    width = intent.width;
    height = intent.height;
  } else if (intent.width != null) {
    width = intent.width;
    height = width / ratio;
  } else if (intent.height != null) {
    height = intent.height;
    width = height * ratio;
  } else {
    width = source.width;
    height = source.height;
    const limit = Math.min(
      intent.maxWidth != null ? intent.maxWidth / width : Infinity,
      intent.maxHeight != null ? intent.maxHeight / height : Infinity,
    );
    if (Number.isFinite(limit) && limit < 1) {
      width *= limit;
      height *= limit;
    }
    if (intent.scale != null) {
      width *= intent.scale;
      height *= intent.scale;
    }
  }

  if (preventUpscale && (width > source.width || height > source.height)) {
    const shrink = Math.min(source.width / width, source.height / height);
    width *= shrink;
    height *= shrink;
  }

  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** Number of halvings to use before the final draw, for a given downscale factor. */
export function stepDownPasses(source: Size, target: Size, maxPasses = 6): number {
  const factor = Math.max(source.width / target.width, source.height / target.height);
  if (!Number.isFinite(factor) || factor <= 2) return 0;
  return Math.min(maxPasses, Math.floor(Math.log2(factor)));
}

function configureSmoothing(context: Canvas2D): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
}

/**
 * Draws `source` into `context` at `target` size, halving in steps first.
 *
 * A single large downscale keeps only one sample per output pixel on several
 * browsers, which turns fine detail into aliasing; halving first averages the
 * pixels that would otherwise be skipped.
 */
export function drawResized(
  context: Canvas2D,
  source: CanvasImageSource,
  sourceSize: Size,
  target: Size,
  destination: { x: number; y: number } = { x: 0, y: 0 },
): void {
  configureSmoothing(context);
  const passes = stepDownPasses(sourceSize, target);

  if (passes === 0) {
    context.drawImage(source, destination.x, destination.y, target.width, target.height);
    return;
  }

  let current = createSurface(Math.ceil(sourceSize.width / 2), Math.ceil(sourceSize.height / 2));
  configureSmoothing(current.context);
  current.context.drawImage(source, 0, 0, current.canvas.width, current.canvas.height);

  for (let pass = 1; pass < passes; pass += 1) {
    const next = createSurface(Math.ceil(current.canvas.width / 2), Math.ceil(current.canvas.height / 2));
    configureSmoothing(next.context);
    next.context.drawImage(current.canvas, 0, 0, next.canvas.width, next.canvas.height);
    releaseSurface(current);
    current = next;
  }

  context.drawImage(current.canvas, destination.x, destination.y, target.width, target.height);
  releaseSurface(current);
}
