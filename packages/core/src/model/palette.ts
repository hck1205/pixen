/**
 * Pixen's annotation palette.
 *
 * The values are chosen for this project — picked for contrast against
 * photographic content and for distinguishability at small sizes on a shared
 * hue wheel. They are not lifted from any design system, product or icon set,
 * and no colour here is meant to match another vendor's token.
 */
export const ANNOTATION_COLOURS = [
  "#ef3e36", // signal red — the default, readable over most photography
  "#f2a007", // amber
  "#2fb673", // green
  "#2f7de1", // blue
  "#8b5cf0", // violet
  "#12161c", // near-black, also the redaction mask
  "#fbfcfe", // near-white
] as const;

export const DEFAULT_ANNOTATION_COLOUR = ANNOTATION_COLOURS[0];

/** Opaque fill used to cover redacted regions. */
export const REDACTION_COLOUR = "#12161c";

/**
 * Stroke width and font size are stored as a fraction of the image's longest
 * edge, so an annotation looks the same on an 800px and an 8000px source.
 */
export const DEFAULT_STROKE_RATIO = 0.005;
export const DEFAULT_FONT_RATIO = 0.045;
