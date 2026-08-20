import { PixenError, toPixenError } from "../errors/index.js";
import type { ImageFormat } from "../model/types.js";
import type { AnyCanvas } from "./canvas.js";
import { imageWorker } from "./worker/client.js";

const LOSSY_FORMATS: readonly ImageFormat[] = ["image/jpeg", "image/webp"];
const TRANSPARENT_FORMATS: readonly ImageFormat[] = ["image/png", "image/webp"];

export function isLossy(format: ImageFormat): boolean {
  return LOSSY_FORMATS.includes(format);
}

export function supportsTransparency(format: ImageFormat): boolean {
  return TRANSPARENT_FORMATS.includes(format);
}

/**
 * How the byte-budget search behaves: how low quality may go, how many attempts
 * it gets, and how hard each attempt undershoots so the loop converges instead
 * of creeping toward the budget.
 */
const MIN_BUDGET_QUALITY = 0.4;
/**
 * The floor any requested quality is clamped to. Zero is not a quality, and a
 * browser handed one produces an image nobody asked for.
 */
const MIN_QUALITY = 0.01;
/** Anything encodes at this; the probe is about the format, not the picture. */
const FORMAT_PROBE_QUALITY = 0.5;
const MAX_BUDGET_ATTEMPTS = 5;
const BUDGET_QUALITY_BACKOFF = 0.9;

export function extensionForFormat(format: ImageFormat): string {
  switch (format) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

/** Async because Safari has historically resolved format support lazily. */
export async function isFormatSupported(format: ImageFormat): Promise<boolean> {
  try {
    const { createSurface, releaseSurface } = await import("./canvas.js");
    const surface = createSurface(1, 1);
    const blob = await encodeSurface(surface.canvas, format, FORMAT_PROBE_QUALITY);
    releaseSurface(surface);
    return blob.type === format;
  } catch {
    return false;
  }
}

/**
 * Encodes a canvas. A browser that does not know the requested format silently
 * falls back to PNG, so the result's real type is checked and reported rather
 * than passed off as the requested one.
 */
export interface EncodeSurfaceOptions {
  /**
   * Whether the encode may be handed to the worker. The byte-budget search
   * turns it off: it encodes up to five times, and reading the canvas back for
   * each attempt costs more than the offload returns.
   */
  offload?: boolean;
}

export async function encodeSurface(
  canvas: AnyCanvas,
  format: ImageFormat,
  quality: number,
  options: EncodeSurfaceOptions = {},
): Promise<Blob> {
  const clampedQuality = Math.min(1, Math.max(MIN_QUALITY, quality));

  if (options.offload !== false) {
    const offloaded = await encodeOnWorker(canvas, format, clampedQuality);
    if (offloaded) return offloaded;
  }

  try {
    if ("convertToBlob" in canvas) {
      return await canvas.convertToBlob({ type: format, quality: clampedQuality });
    }
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new PixenError("ENCODE_FAILED", `Encoding to ${format} produced no data`));
        },
        format,
        clampedQuality,
      );
    });
  } catch (cause) {
    throw toPixenError(cause, "ENCODE_FAILED", `Failed to encode image as ${format}`);
  }
}

/**
 * Above this many pixels a lossy encode is long enough that moving it off the
 * main thread is worth reading the canvas back first.
 */
const WORKER_ENCODE_MIN_PIXELS = 1_000_000;

/**
 * Encodes on the worker, or returns null so the caller does it here.
 *
 * Only lossy formats and only large surfaces: PNG encoding is comparatively
 * cheap, and below a megapixel the readback costs more than the encode saves.
 */
async function encodeOnWorker(canvas: AnyCanvas, format: ImageFormat, quality: number): Promise<Blob | null> {
  if (!isLossy(format)) return null;
  if (canvas.width * canvas.height < WORKER_ENCODE_MIN_PIXELS) return null;

  try {
    const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return null;
    // Throws on a tainted canvas, which is a fallback rather than an error.
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return await imageWorker().encode(image.data.buffer as ArrayBuffer, canvas.width, canvas.height, format, quality);
  } catch {
    return null;
  }
}

export interface BudgetOptions {
  minQuality?: number;
  steps?: number;
  /**
   * Called after each attempt with the attempt number and the ceiling.
   *
   * The ceiling is a limit rather than an estimate: most pictures fit on the
   * first or second try and the search stops there, so a bar driven by this
   * finishes early rather than crawling.
   */
  onAttempt?: (attempt: number, steps: number) => void;
}

/**
 * Encodes repeatedly, lowering quality until the blob fits `maxBytes`.
 * Returns the smallest attempt when even the lowest quality overshoots.
 */
export async function encodeWithinBudget(
  canvas: AnyCanvas,
  format: ImageFormat,
  quality: number,
  maxBytes: number,
  options: BudgetOptions = {},
): Promise<{ blob: Blob; quality: number; attempts: number }> {
  const minQuality = options.minQuality ?? MIN_BUDGET_QUALITY;
  const steps = options.steps ?? MAX_BUDGET_ATTEMPTS;

  let attempt = 0;
  let currentQuality = quality;
  let best: Blob | null = null;
  let bestQuality = quality;

  while (attempt < steps) {
    attempt += 1;
    const blob = await encodeSurface(canvas, format, currentQuality, { offload: false });
    options.onAttempt?.(attempt, steps);
    if (!best || blob.size < best.size) {
      best = blob;
      bestQuality = currentQuality;
    }
    if (blob.size <= maxBytes || !isLossy(format) || currentQuality <= minQuality) {
      return { blob, quality: currentQuality, attempts: attempt };
    }
    // Size scales roughly with quality, so aim at the ratio and bias downwards.
    const ratio = maxBytes / blob.size;
    currentQuality = Math.max(
      minQuality,
      Math.min(currentQuality * BUDGET_QUALITY_BACKOFF, currentQuality * ratio),
    );
  }

  if (!best) throw new PixenError("ENCODE_FAILED", "Encoding produced no data");
  return { blob: best, quality: bestQuality, attempts: attempt };
}
