/**
 * What Pixen can do, read out of Pixen.
 *
 * This is the verification surface: every capability, what it actually is right
 * now, and what would fail if it stopped being true. Anyone comparing Pixen
 * against another editor's feature list works down this page instead of taking
 * a README's word for it.
 *
 * Two rules keep it from drifting into marketing. Where a capability is a set
 * of things — tools, formats, presets, locales — the detail is derived from the
 * export that defines them, so deleting a preset deletes it from this page too.
 * And the evidence is structured rather than prose, so `coverage.test.ts` can
 * check that every file and story named here exists.
 *
 * The table is assembled from four slices, in the order a picture travels:
 * getting in, being edited, coming out, and the surface a person and a host
 * touch.
 */
import { EDITING_COVERAGE } from "./editing.js";
import { INTAKE_COVERAGE } from "./intake.js";
import { OUTPUT_COVERAGE } from "./output.js";
import { SURFACE_COVERAGE } from "./surface.js";
import type { CoverageGroup } from "./evidence.js";

export * from "./evidence.js";

export const COVERAGE: CoverageGroup[] = [
  ...INTAKE_COVERAGE,
  ...EDITING_COVERAGE,
  ...OUTPUT_COVERAGE,
  ...SURFACE_COVERAGE,
];

export function coverageCount(): number {
  return COVERAGE.reduce((total, group) => total + group.entries.length, 0);
}
