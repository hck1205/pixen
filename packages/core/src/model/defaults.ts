import { DEFAULT_ANNOTATION_COLOUR } from "./palette.js";
import type { RedactionMode } from "./types.js";

/**
 * Default values for a new document and its layers.
 *
 * They were spread across the factories, the type defaults and the validator's
 * fallbacks — three places that had to agree and no way to notice when they
 * stopped. One module means a default can be changed once.
 */

/**
 * Lossy quality when neither the host nor the format has anything to say.
 *
 * A format that is not in the table below — a lossless one, or one added later
 * — falls back to this.
 */
const DEFAULT_QUALITY = 0.85;

/**
 * What each encoder is asked for when nobody said.
 *
 * The same number does not mean the same thing to two encoders, so one default
 * for both is one of them being wrong. These were measured rather than picked:
 * three pictures were encoded across the quality range in Chromium and compared
 * against the source, pixel by pixel, as root-mean-square error.
 *
 *   - On a photograph — smooth sky, textured ground, hard-edged text, grain —
 *     WebP at 0.85 came out both smaller and closer to the source than JPEG at
 *     0.85 (120 KB at 3.20 against 128 KB at 3.74). Matching JPEG's error took
 *     it about 0.05 lower.
 *   - On a deliberately hard picture — fine noise, sharp text, saturated edges
 *     — the gap was wider: matching JPEG at 0.90 took WebP to about 0.79.
 *   - On a nearly flat illustration the order reversed, and both encoders were
 *     within an error of 1 across the whole range: invisible either way.
 *
 * So the offset is real on the pictures where quality is visible at all, and
 * small: JPEG a little above the old single default, WebP a little below. The
 * measurement is in `docs/PROVENANCE.md` and can be run again.
 */
const DEFAULT_QUALITY_BY_FORMAT: Readonly<Record<string, number>> = Object.freeze({
  "image/jpeg": 0.88,
  "image/webp": 0.82,
});

/** The quality an export uses: the host's, else the format's, else the fallback. */
export function resolveQuality(format: string, stored: number | null | undefined): number {
  if (stored != null) return stored;
  return DEFAULT_QUALITY_BY_FORMAT[format] ?? DEFAULT_QUALITY;
}

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

/**
 * The frame a host gets by switching one on, as fractions of the longest edge.
 * A frame that scaled in pixels would be hairline on a 6000px export.
 */
export const DEFAULT_FRAME = Object.freeze({
  style: "solid" as const,
  width: 0.02,
  colour: "#ffffff",
  radius: 0.03,
  inset: 0.02,
});

export const MIN_FRAME_WIDTH = 0.002;
export const MAX_FRAME_WIDTH = 0.1;

/** The stroke a new annotation gets when the caller does not supply one. */
export const DEFAULT_STROKE = Object.freeze({
  color: DEFAULT_ANNOTATION_COLOUR,
  width: DEFAULT_STROKE_WIDTH,
});
