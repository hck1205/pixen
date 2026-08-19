import { DEFAULT_ANNOTATION_COLOUR } from "./palette.js";
import type { RedactionMode } from "./types.js";

/**
 * Default values for a new document and its layers.
 *
 * They were spread across the factories, the type defaults and the validator's
 * fallbacks — three places that had to agree and no way to notice when they
 * stopped. One module means a default can be changed once.
 */

/** Lossy quality used when the host expresses no preference. */
export const DEFAULT_QUALITY = 0.85;

export const DEFAULT_LAYER_OPACITY = 1;
export const DEFAULT_LAYER_ROTATION = 0;
export const DEFAULT_LAYER_VISIBLE = true;
export const DEFAULT_LAYER_LOCKED = false;

/** Stroke width in image pixels, before a tool scales it to the image. */
const DEFAULT_STROKE_WIDTH = 8;

export const DEFAULT_FONT_SIZE = 48;
export const DEFAULT_FONT_FAMILY = "system-ui, sans-serif";
export const DEFAULT_TEXT_COLOUR = "#ffffff";
export const DEFAULT_TEXT_ALIGN = "left" as const;

export const DEFAULT_CORNER_RADIUS = 0;

/**
 * Redaction defaults. `solid` is the default mode because it is the only one
 * that removes the pixels rather than obscuring them.
 */
export const DEFAULT_REDACTION_MODE: RedactionMode = "solid";
/** Blur radius and pixel block size, as a fraction of the image's longest edge. */
export const DEFAULT_REDACTION_STRENGTH = 0.02;
export const MIN_REDACTION_STRENGTH = 0.002;
export const MAX_REDACTION_STRENGTH = 0.08;

/** The stroke a new annotation gets when the caller does not supply one. */
export const DEFAULT_STROKE = Object.freeze({
  color: DEFAULT_ANNOTATION_COLOUR,
  width: DEFAULT_STROKE_WIDTH,
});
