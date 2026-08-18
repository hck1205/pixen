import type { Adjustments } from "../model/types.js";
import type { Canvas2D } from "../image/canvas.js";

let filterSupport: boolean | null = null;

/** Canvas2D `filter` is unavailable on older Safari, so it is feature-detected once. */
export function supportsContextFilter(context: Canvas2D): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    const previous = context.filter;
    context.filter = "brightness(1.5)";
    filterSupport = context.filter !== "none" && context.filter !== "";
    context.filter = previous ?? "none";
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

/** Test seam: lets the suite exercise both the filter and the pixel fallback path. */
export function setContextFilterSupport(value: boolean | null): void {
  filterSupport = value;
}

/**
 * Pixel fallback matching the CSS filter chain `brightness contrast saturate`.
 *
 * Kept in sync with `cssFilter` on purpose: an export must not look different
 * from the preview just because the browser lacks canvas filters.
 */
export function applyAdjustmentsToImageData(data: Uint8ClampedArray, adjustments: Adjustments): void {
  const brightness = 1 + adjustments.brightness;
  const contrast = 1 + adjustments.contrast;
  const saturation = 1 + adjustments.saturation;
  if (brightness === 1 && contrast === 1 && saturation === 1) return;

  const contrastOffset = 127.5 * (1 - contrast);

  for (let i = 0; i < data.length; i += 4) {
    let r = (data[i] ?? 0) * brightness;
    let g = (data[i + 1] ?? 0) * brightness;
    let b = (data[i + 2] ?? 0) * brightness;

    r = r * contrast + contrastOffset;
    g = g * contrast + contrastOffset;
    b = b * contrast + contrastOffset;

    // Luminance coefficients from the saturate() colour matrix in the W3C
    // Filter Effects specification, so the fallback matches what the browser's
    // own filter would have produced.
    const luma = 0.213 * r + 0.715 * g + 0.072 * b;
    r = luma + (r - luma) * saturation;
    g = luma + (g - luma) * saturation;
    b = luma + (b - luma) * saturation;

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

export function hasAdjustments(adjustments: Adjustments): boolean {
  return adjustments.brightness !== 0 || adjustments.contrast !== 0 || adjustments.saturation !== 0;
}
