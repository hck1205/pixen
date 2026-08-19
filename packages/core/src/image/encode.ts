import { PixenError, toPixenError } from "../errors/index.js";
import type { ImageFormat } from "../model/types.js";
import type { AnyCanvas } from "./canvas.js";

export const LOSSY_FORMATS: readonly ImageFormat[] = ["image/jpeg", "image/webp"];
export const TRANSPARENT_FORMATS: readonly ImageFormat[] = ["image/png", "image/webp"];

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
export const MIN_BUDGET_QUALITY = 0.4;
export const MAX_BUDGET_ATTEMPTS = 5;
export const BUDGET_QUALITY_BACKOFF = 0.9;

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
    const blob = await encodeSurface(surface.canvas, format, 0.5);
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
export async function encodeSurface(
  canvas: AnyCanvas,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  const clampedQuality = Math.min(1, Math.max(0.01, quality));
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
 * Encodes repeatedly, lowering quality until the blob fits `maxBytes`.
 * Returns the smallest attempt when even the lowest quality overshoots.
 */
export async function encodeWithinBudget(
  canvas: AnyCanvas,
  format: ImageFormat,
  quality: number,
  maxBytes: number,
  options: { minQuality?: number; steps?: number } = {},
): Promise<{ blob: Blob; quality: number; attempts: number }> {
  const minQuality = options.minQuality ?? MIN_BUDGET_QUALITY;
  const steps = options.steps ?? MAX_BUDGET_ATTEMPTS;

  let attempt = 0;
  let currentQuality = quality;
  let best: Blob | null = null;
  let bestQuality = quality;

  while (attempt < steps) {
    attempt += 1;
    const blob = await encodeSurface(canvas, format, currentQuality);
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
