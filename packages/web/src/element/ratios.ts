import type { PixenStrings } from "../i18n/index.js";

/**
 * The aspect ratios the crop tool offers, and how a host's own list becomes
 * one.
 */

export interface AspectRatioOption {
  label: string;
  value: number | null;
}

export const DEFAULT_ASPECT_RATIOS: readonly AspectRatioOption[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
];

/** Labels for the ratios a host is likely to pass as bare numbers. */
export const KNOWN_RATIO_LABELS: ReadonlyArray<readonly [number, string]> = [
  [1, "1:1"],
  [4 / 3, "4:3"],
  [3 / 2, "3:2"],
  [16 / 9, "16:9"],
  [3 / 4, "3:4"],
  [2 / 3, "2:3"],
  [9 / 16, "9:16"],
];

export const FREEFORM_RATIO_LABEL = "Free";

/** Ratios closer than this are the same ratio, whatever the float says. */
export const RATIO_TOLERANCE = 0.0001;

/** Two ratios are the same when float noise is all that separates them. */
export function ratiosEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < RATIO_TOLERANCE;
}

/** A readable label for a bare ratio: "16:9" where we know it, otherwise "1.85". */
export function ratioLabel(value: number | null): string {
  if (value === null) return FREEFORM_RATIO_LABEL;
  const match = KNOWN_RATIO_LABELS.find(([candidate]) => ratiosEqual(candidate, value));
  return match ? match[1] : value.toFixed(2);
}

/**
 * What a ratio button says.
 *
 * `DEFAULT_ASPECT_RATIOS` is static, so it cannot know the locale: the
 * freeform entry carries `FREEFORM_RATIO_LABEL` as a placeholder, and the panel
 * swaps in the translated word when it renders. Without that the crop panel
 * read "Free" in all nine languages while `strings.freeform` sat translated in
 * every one of them, used by nothing.
 *
 * A host that named the entry itself is left alone — its label is the answer,
 * whatever language it is in.
 */
export function ratioButtonLabel(ratio: AspectRatioOption, strings: PixenStrings): string {
  return ratio.value === null && ratio.label === FREEFORM_RATIO_LABEL ? strings.freeform : ratio.label;
}

/**
 * Accepts what a host is likely to pass — numbers, nulls, or fully described
 * options — and returns the list the crop inspector renders.
 */
export function normaliseAspectRatios(
  value: readonly (number | null | AspectRatioOption)[] | null | undefined,
): AspectRatioOption[] {
  if (!Array.isArray(value) || value.length === 0) return [...DEFAULT_ASPECT_RATIOS];
  return value.map((entry) =>
    typeof entry === "object" && entry !== null ? entry : { label: ratioLabel(entry), value: entry },
  );
}
