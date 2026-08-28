import { MAX_STRAIGHTEN, toDegrees } from "@pixen/core";

/**
 * How far each slider goes and how coarse it is.
 *
 * Where the engine has a limit of its own, the range is derived from it rather
 * than restated. The straighten slider used to say ±45° with a comment
 * promising that "the engine clamps to the same" — one fact with two homes, and
 * a sentence holding them together. Widening `MAX_STRAIGHTEN` would have left
 * the slider stopping where it always did, and nothing would have failed.
 *
 * The rest have no engine limit behind them, which is worth knowing when
 * reading one: these bounds are the only thing keeping a stroke a stroke.
 */
export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

/** Stroke width, as a fraction of the image's longest edge. */
export const STROKE_WIDTH_RANGE: SliderRange = { min: 0.001, max: 0.02, step: 0.001 };

/** Corner rounding, as a fraction of a rectangle's shorter side. */
export const CORNER_RATIO_RANGE: SliderRange = { min: 0, max: 0.5, step: 0.01 };

/** Type size, as a fraction of the image's longest edge. */
export const FONT_RATIO_RANGE: SliderRange = { min: 0.01, max: 0.15, step: 0.005 };

/** Layer opacity, and rotation in degrees — the inspector's two layer sliders. */
export const OPACITY_RANGE: SliderRange = { min: 0, max: 1, step: 0.05 };
export const ROTATION_RANGE: SliderRange = { min: -180, max: 180, step: 1 };

/** Encoder quality, for the formats that have one. */
export const OUTPUT_QUALITY_RANGE: SliderRange = { min: 0.3, max: 1, step: 0.01 };

/** Half a degree: fine enough to level a horizon, coarse enough to drag. */
const STRAIGHTEN_STEP = 0.5;

/** Straighten, in degrees, as far each way as the engine will accept. */
export const STRAIGHTEN_RANGE: SliderRange = {
  min: -toDegrees(MAX_STRAIGHTEN),
  max: toDegrees(MAX_STRAIGHTEN),
  step: STRAIGHTEN_STEP,
};
