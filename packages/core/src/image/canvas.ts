import { PixenError } from "../errors/index.js";
import type { Size } from "../geometry/types.js";

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CanvasSurface {
  canvas: AnyCanvas;
  context: Canvas2D;
}

/** Intrinsic pixel size of any drawable source. */
export function sourceSize(source: CanvasImageSource): Size {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  const candidate = source as unknown as Size;
  return { width: Number(candidate.width), height: Number(candidate.height) };
}

/** Guard against decompression bombs and canvases the platform silently refuses. */
export const MAX_CANVAS_PIXELS = 268_435_456; // 16384 x 16384

export function assertDrawableSize(size: Size, what = "image"): void {
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new PixenError("INVALID_IMAGE", `Refusing to allocate a ${width}x${height} ${what}`, {
      details: { width, height },
    });
  }
  if (width * height > MAX_CANVAS_PIXELS) {
    throw new PixenError(
      "MEMORY_LIMIT",
      `${what} of ${width}x${height} exceeds the ${MAX_CANVAS_PIXELS} pixel limit`,
      { details: { width, height, limit: MAX_CANVAS_PIXELS } },
    );
  }
}

/** OffscreenCanvas keeps one code path for the main thread and a worker. */
function hasOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

/**
 * Allocates a drawing surface. Prefers `OffscreenCanvas` so the same code runs
 * on the main thread and in a worker; falls back to a DOM canvas.
 */
export function createSurface(width: number, height: number, alpha = true): CanvasSurface {
  assertDrawableSize({ width, height }, "canvas");
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (hasOffscreenCanvas()) {
    const canvas = new OffscreenCanvas(w, h);
    const context = canvas.getContext("2d", { alpha }) as OffscreenCanvasRenderingContext2D | null;
    if (!context) throw new PixenError("EXPORT_FAILED", "Could not acquire a 2D context on OffscreenCanvas");
    return { canvas, context };
  }

  if (typeof document === "undefined") {
    throw new PixenError("EXPORT_FAILED", "No canvas implementation available in this environment");
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { alpha });
  if (!context) throw new PixenError("EXPORT_FAILED", "Could not acquire a 2D context on HTMLCanvasElement");
  return { canvas, context };
}

/**
 * Releases the backing store of a canvas that is about to be dropped.
 *
 * Zeroing the dimensions is the only portable way to free canvas memory
 * immediately, which matters a lot on mobile Safari.
 */
function releaseCanvas(canvas: AnyCanvas | null | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/** The same, for a surface. The context is not involved either way. */
export function releaseSurface(surface: CanvasSurface | null | undefined): void {
  releaseCanvas(surface?.canvas);
}

/**
 * Lets a drawable go.
 *
 * The three kinds hold memory the garbage collector will not hurry over: an
 * `ImageBitmap` owns pixels outside the heap, and a canvas is worth handing back
 * to the pool rather than reallocating. Anything else — an `<img>`, a video —
 * is not ours to release.
 *
 * Every kind is guarded by a `typeof` because this package runs on the main
 * thread, in a worker, and in node, and each of those is missing a different
 * one of them.
 */
export function disposeImageSource(source: CanvasImageSource | null | undefined): void {
  if (!source) return;
  if (isImageBitmap(source)) {
    source.close();
    return;
  }
  if (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) {
    releaseCanvas(source);
    return;
  }
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    releaseCanvas(source);
  }
}

/** Narrowing that also survives an environment with no `ImageBitmap` at all. */
function isImageBitmap(source: CanvasImageSource): source is ImageBitmap {
  return typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
}
