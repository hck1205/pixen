import { DEFAULT_ADJUSTMENTS, type Adjustments } from "../model/types.js";

/**
 * Named looks, each one nothing more than a set of adjustment values.
 *
 * A preset is deliberately not a new concept in the document: applying one
 * writes the same numbers a slider would, so it undoes as one step, serialises
 * as ordinary adjustments, and can be nudged afterwards rather than being an
 * opaque mode the user has to leave first.
 *
 * The values were chosen here by eye against the sample image. Anyone is free
 * to disagree with them — `editor.setAdjustments` takes the same fields.
 */
export interface AdjustmentPreset {
  id: string;
  /** Untranslated fallback; the UI prefers a localised string when it has one. */
  label: string;
  adjustments: Partial<Adjustments>;
}

export const ADJUSTMENT_PRESETS: readonly AdjustmentPreset[] = [
  { id: "original", label: "Original", adjustments: {} },
  { id: "vivid", label: "Vivid", adjustments: { saturation: 0.35, contrast: 0.18 } },
  { id: "soft", label: "Soft", adjustments: { saturation: -0.2, contrast: -0.12, exposure: 0.15 } },
  { id: "mono", label: "Mono", adjustments: { grayscale: 1, contrast: 0.1 } },
  { id: "noir", label: "Noir", adjustments: { grayscale: 1, contrast: 0.45, exposure: -0.15 } },
  { id: "warm", label: "Warm", adjustments: { sepia: 0.35, saturation: 0.1, hue: -8 } },
  { id: "cool", label: "Cool", adjustments: { hue: 14, saturation: -0.08, exposure: 0.05 } },
  { id: "fade", label: "Fade", adjustments: { contrast: -0.25, exposure: 0.2, saturation: -0.18 } },
  { id: "spotlight", label: "Spotlight", adjustments: { vignette: 0.6, contrast: 0.12 } },
];

/** The full adjustment set a preset stands for: its own values over neutral. */
export function presetAdjustments(preset: AdjustmentPreset): Adjustments {
  return { ...DEFAULT_ADJUSTMENTS, ...preset.adjustments };
}

/**
 * The preset the current adjustments match exactly, if any.
 *
 * Exact rather than nearest: once a slider has been moved the answer is "none
 * of them", and a UI that kept a preset highlighted would be lying about what
 * the document holds.
 */
export function matchingPreset(adjustments: Adjustments): AdjustmentPreset | null {
  return (
    ADJUSTMENT_PRESETS.find((preset) => {
      const target = presetAdjustments(preset);
      return (Object.keys(target) as Array<keyof Adjustments>).every((key) => target[key] === adjustments[key]);
    }) ?? null
  );
}
