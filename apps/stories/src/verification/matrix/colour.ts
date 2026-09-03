/**
 * The adjustments, the presets, and what a browser without filters gets.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { doc, list, required, story, unit, visual, type ClaimGroup } from "../claim.js";
import { ADJUSTMENT_KEYS, ADJUSTMENT_PRESETS } from "@pixen/core";

export const COLOUR_CLAIMS: ClaimGroup = {
    title: "Colour",
    summary: "What changes the colour of the picture rather than where it is.",
    claims: [
      {
        capability: "Adjustments",
        pixen: list(ADJUSTMENT_KEYS),
        verdict: "unmeasured",
        evidence: [unit("processing.test.ts"), story("Adjustments"), visual("visual.spec.ts")],
        note:
          "Through the canvas `filter` chain where the browser has it, and a per-pixel pass where it does " +
          "not — the same numbers either way, from the W3C Filter Effects definitions",
      },
      {
        capability: "Presets",
        pixen: list(ADJUSTMENT_PRESETS.map((preset) => preset.label)),
        verdict: "unmeasured",
        evidence: [unit("processing.test.ts"), story("Presets"), visual("visual.spec.ts")],
        note: "A preset writes the same fields a slider does, so it stays editable rather than being a mode to leave",
      },
      {
        capability: "Per-pixel adjustments",
        pixen: "Gamma, and white balance on both axes — temperature and tint",
        verdict: "met",
        market: required("adjustments", "Colour controls beyond the filter primitives the canvas exposes"),
        evidence: [unit("adjustments.test.ts"), story("Adjustments"), doc("docs/ROADMAP.md")],
        note:
          "A filter chain is a fixed set of functions and neither a gamma curve nor a channel gain is " +
          "among them, so these cost a pass over every pixel whatever engine is drawing. `adjustmentPlan` " +
          "is what keeps the two engines agreeing: with a filter the browser does what it can and these " +
          "run after it, without one everything runs in the pass — and the same file comes out either way",
      },
    ],
  };
