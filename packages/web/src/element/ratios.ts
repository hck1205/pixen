import {
  DEFAULT_ASPECT_RATIOS,
  FREEFORM_RATIO_LABEL,
  KNOWN_RATIO_LABELS,
  RATIO_TOLERANCE,
  type AspectRatioOption,
} from "./constants.js";

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
