/**
 * The verification matrix, assembled in the order a picture travels: getting
 * in, being shaped, being drawn on, coming out — then the seams a host reaches
 * into, the surface a person touches, video, and the claims that are not
 * features at all.
 *
 * See `verification/claim.ts` for what a verdict is allowed to mean, and why
 * there is no verdict meaning "they cannot do this".
 */
import { ANNOTATE_CLAIMS } from "./annotate.js";
import { ASSURANCE_CLAIMS } from "./assurance.js";
import { GEOMETRY_CLAIMS } from "./geometry.js";
import { INTAKE_CLAIMS } from "./intake.js";
import { OUTPUT_CLAIMS } from "./output.js";
import { PIPELINE_CLAIMS } from "./pipeline.js";
import { SURFACE_CLAIMS } from "./surface.js";
import { VIDEO_CLAIMS } from "./video.js";
import type { ClaimGroup } from "../claim.js";

export { ANNOTATE_CLAIMS, ASSURANCE_CLAIMS, GEOMETRY_CLAIMS, INTAKE_CLAIMS };
export { OUTPUT_CLAIMS, PIPELINE_CLAIMS, SURFACE_CLAIMS, VIDEO_CLAIMS };

/** Every claim on the page, for the scorecard and for the test that checks them. */
export const VERIFICATION: ClaimGroup[] = [
  ...INTAKE_CLAIMS,
  ...GEOMETRY_CLAIMS,
  ...ANNOTATE_CLAIMS,
  ...OUTPUT_CLAIMS,
  ...PIPELINE_CLAIMS,
  ...SURFACE_CLAIMS,
  ...VIDEO_CLAIMS,
  ...ASSURANCE_CLAIMS,
];
