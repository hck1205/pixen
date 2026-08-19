import { supportsTransparency, type ImageFormat, type OutputSettings, type Size } from "@pixen/core";

/**
 * What the output panel decides.
 *
 * Resizing has one rule worth stating: the document stores a *target*, not a
 * scale, and `outputSize` already scales the other side when only one is set.
 * So keeping the aspect ratio is not arithmetic here — it is storing one side
 * and leaving the other null. Getting that backwards is how a linked field ends
 * up drifting a pixel every time it is typed into, which is why it is a
 * function with a test rather than two lines in an event handler.
 */
export type SizeEdge = "width" | "height";

/** The width/height half of the output settings, which is all a resize touches. */
export type SizeTarget = Pick<OutputSettings, "width" | "height">;

/** The largest export Pixen will accept from the panel, per side. */
export const MAX_OUTPUT_EDGE = 16384;

/**
 * What typing a number into one side means.
 *
 * Null when the field says nothing usable — mid-edit it is empty, or zero, or a
 * word — because a resize to one pixel is not what a half-typed number meant.
 */
export function resizePatch(edge: SizeEdge, value: number, current: Size, linked: boolean): SizeTarget | null {
  if (!Number.isFinite(value) || value < 1) return null;
  const size = Math.min(Math.round(value), MAX_OUTPUT_EDGE);

  // Linked: store the typed side only, and let the document scale the other.
  if (linked) return edge === "width" ? { width: size, height: null } : { width: null, height: size };

  return edge === "width" ? { width: size, height: current.height } : { width: current.width, height: size };
}

/**
 * Whether the two sides move together.
 *
 * Derived rather than remembered: a document that pins one side is asking for
 * the other to follow, and one that pins both is asking for exactly that size.
 * A separate flag in the element would be a second copy of the same fact, and
 * the two would disagree the first time a host set `output` itself.
 */
export function ratioLinked(output: SizeTarget): boolean {
  return output.width === null || output.height === null;
}

/**
 * What the link toggle does, given the size the picture exports at now.
 *
 * Unlinking pins what is on screen, so nothing moves at the moment of the
 * click; linking lets go of the height and keeps the width.
 */
export function linkTogglePatch(output: SizeTarget, current: Size): SizeTarget {
  if (ratioLinked(output)) return { width: current.width, height: current.height };
  return { width: current.width, height: null };
}

/** Back to whatever the crop is: no target at all. */
export const NATURAL_SIZE: SizeTarget = { width: null, height: null };

/** True when the document carries a resize rather than exporting the crop as it is. */
export function isResized(output: SizeTarget): boolean {
  return output.width !== null || output.height !== null;
}

/**
 * Formats the picker offers. Null is "the same kind of file that came in",
 * which is the right default and the only one that cannot be spelled as a
 * MIME type.
 */
export const OUTPUT_FORMATS: ReadonlyArray<ImageFormat | null> = [null, "image/jpeg", "image/png", "image/webp"];

/** What to call a format in a button. Proper nouns, so not translated. */
const FORMAT_LABELS: Record<ImageFormat, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

export function formatLabel(format: ImageFormat): string {
  return FORMAT_LABELS[format];
}

/** Encoders that throw information away, and so take a quality. */
const LOSSY_FORMATS: readonly ImageFormat[] = ["image/jpeg", "image/webp"];

/** Whether a quality slider means anything for the format that will be used. */
export function qualityApplies(format: ImageFormat): boolean {
  return LOSSY_FORMATS.includes(format);
}

/**
 * Whether a background colour is doing any work.
 *
 * A format without an alpha channel has to put *something* behind a transparent
 * pixel, so the choice matters; with alpha it is an option rather than a
 * necessity, and the panel says so by offering it either way.
 */
export function backgroundRequired(format: ImageFormat): boolean {
  return !supportsTransparency(format);
}
