import { ADJUSTMENT_KEYS, type AdjustmentKey, type Adjustments } from "./types.js";

/**
 * What each adjustment means, and the range a control may offer.
 *
 * Every adjustment here is either a CSS filter function the browser applies to
 * the whole image, or the vignette, which is drawn. Nothing needs a per-pixel
 * pass during a drag, which is what keeps a slider interactive on a large
 * image — and what decides which adjustments this version ships.
 */
export interface AdjustmentRange {
  min: number;
  max: number;
  step: number;
  /** The value at which the adjustment does nothing. Always 0 here, by design. */
  neutral: 0;
  /** What the number means, for the documentation and for anyone reading it. */
  unit: "stops" | "ratio" | "degrees" | "amount";
}

export const ADJUSTMENT_RANGES: Readonly<Record<AdjustmentKey, AdjustmentRange>> = Object.freeze({
  // Photographic exposure: one stop is a doubling, so it is a multiplier rather
  // than the linear nudge `brightness` gives.
  exposure: { min: -2, max: 2, step: 0.05, neutral: 0, unit: "stops" },
  brightness: { min: -1, max: 1, step: 0.01, neutral: 0, unit: "ratio" },
  contrast: { min: -1, max: 1, step: 0.01, neutral: 0, unit: "ratio" },
  saturation: { min: -1, max: 1, step: 0.01, neutral: 0, unit: "ratio" },
  hue: { min: -180, max: 180, step: 1, neutral: 0, unit: "degrees" },
  grayscale: { min: 0, max: 1, step: 0.01, neutral: 0, unit: "amount" },
  sepia: { min: 0, max: 1, step: 0.01, neutral: 0, unit: "amount" },
  invert: { min: 0, max: 1, step: 0.01, neutral: 0, unit: "amount" },
  vignette: { min: 0, max: 1, step: 0.01, neutral: 0, unit: "amount" },
});

/** Clamps every value to its own range, so a bad host value cannot reach the renderer. */
export function clampAdjustments(adjustments: Adjustments): Adjustments {
  const clamped = {} as Adjustments;
  for (const key of ADJUSTMENT_KEYS) {
    const range = ADJUSTMENT_RANGES[key];
    const value = adjustments[key];
    clamped[key] = Number.isFinite(value) ? Math.min(Math.max(value, range.min), range.max) : range.neutral;
  }
  return clamped;
}

/** True when any adjustment is off its neutral value. */
export function hasAdjustments(adjustments: Adjustments): boolean {
  return ADJUSTMENT_KEYS.some((key) => adjustments[key] !== ADJUSTMENT_RANGES[key].neutral);
}
