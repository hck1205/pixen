import { fitScale, roundedSize } from "../geometry/rect.js";
import type { Size } from "../geometry/types.js";
import { createSurface, releaseSurface, type Canvas2D } from "./canvas.js";

/**
 * What to do when a width *and* a height are asked for and the picture's own
 * ratio disagrees with them.
 *
 * `force` is the default because an explicit pair of numbers is usually meant
 * literally — the output panel's two boxes, an avatar that has to be exactly
 * 512 square. The other two keep the ratio and treat the pair as a box:
 * `contain` fits inside it, `cover` fills it and lets the picture overflow.
 */
export const RESIZE_FITS = ["force", "contain", "cover"] as const;
export type ResizeFit = (typeof RESIZE_FITS)[number];

export interface ResizeIntent {
  /** Hard target; wins over the max/scale hints. */
  width?: number | null;
  height?: number | null;
  /** Only consulted when both `width` and `height` are set. Defaults to `force`. */
  fit?: ResizeFit;
  maxWidth?: number | null;
  maxHeight?: number | null;
  scale?: number | null;
  /** Never enlarge beyond the source. Default true. */
  preventUpscale?: boolean;
}

/**
 * Resolves a resize intent into concrete output pixels.
 *
 * Rules, in order: an explicit width/height pair wins, read literally or as a
 * box depending on `fit`; a single explicit side scales the other
 * proportionally; otherwise the max hints shrink the image to fit and `scale`
 * multiplies what is left. `preventUpscale` applies last, to whatever came out.
 */
export function resolveSize(source: Size, intent: ResizeIntent = {}): Size {
  const ratio = source.width / source.height;
  const preventUpscale = intent.preventUpscale !== false;

  let width: number;
  let height: number;

  if (intent.width != null && intent.height != null) {
    const box = { width: intent.width, height: intent.height };
    const fit = intent.fit ?? "force";
    const scale = fit === "force" ? null : fitScale(source, box, fit);
    width = scale === null ? box.width : source.width * scale;
    height = scale === null ? box.height : source.height * scale;
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

  return roundedSize(width, height);
}

/** Number of halvings to use before the final draw, for a given downscale factor. */
export function stepDownPasses(source: Size, target: Size, maxPasses = 6): number {
  const factor = Math.max(source.width / target.width, source.height / target.height);
  if (!Number.isFinite(factor) || factor <= 2) return 0;
  return Math.min(maxPasses, Math.floor(Math.log2(factor)));
}

/**
 * The size to pre-shrink a source to before a small export is drawn from it,
 * or `null` when drawing from the source itself is already fine.
 *
 * An export draws a *region* of the source — the crop — onto the target, so how
 * far the pixels are being shrunk is the crop's ratio to the target, not the
 * whole bitmap's. But what gets pre-shrunk is the whole bitmap, because the
 * scene still has to place the crop, the rotation and every annotation against
 * it. So the shrink factor is read from the crop and applied to the source.
 *
 * `null` rather than "the source size" so the caller cannot accidentally make a
 * pointless full-size copy of the bitmap, which on a large photograph is tens of
 * megabytes for no change in the result.
 */
export function standInSize(source: Size, crop: Size, target: Size): Size | null {
  if (stepDownPasses(crop, target) === 0) return null;

  // Sized so the crop lands at the target's own pixels: any smaller and the
  // stand-in would itself be the thing losing detail.
  const fit = Math.min(1, target.width / crop.width, target.height / crop.height);
  const width = Math.max(1, Math.round(source.width * fit));

  // A stand-in that is not actually smaller is a full-size copy of the bitmap
  // for no change in the result — tens of megabytes on a large photograph.
  const scale = width / source.width;
  if (scale >= 1) return null;

  // The height follows the width's *rounded* scale rather than `fit`, because
  // the scene is told a single number for both. Rounding the two independently
  // would leave the stand-in a fraction off the source's aspect ratio, and the
  // scene would draw that fraction as a stretch.
  return { width, height: Math.max(1, Math.round(source.height * scale)) };
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
