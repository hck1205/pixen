/**
 * Where the pixels are: the crop, the angle, the size that comes out.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, list, required, story, unit, type ClaimGroup } from "../claim.js";
import { RESIZE_FITS } from "@pixen/core";
import { DEFAULT_ASPECT_RATIOS } from "@pixen/web";

const RATIOS = list(DEFAULT_ASPECT_RATIOS.map((ratio) => ratio.label));

export const GEOMETRY_CLAIMS: ClaimGroup[] = [
  {
    title: "Geometry",
    summary:
      "Four coordinate spaces — image, stage, output, view — and every conversion through one module, " +
      "which is why a crop survives a rotate and a handle lands where the pointer is.",
    claims: [
      {
        capability: "Crop",
        pixen: `Drag the region or its eight handles; ratios ${RATIOS}, or whatever the host supplies`,
        verdict: "unmeasured",
        evidence: [unit("crop.test.ts"), story("AspectRatios"), browser("editor.spec.ts")],
      },
      {
        capability: "Ratio locking",
        pixen:
          "A locked ratio drives the free axis from the dragged one, honours the minimum on both axes, " +
          "and grows a side drag about the perpendicular centre so the layer does not walk",
        verdict: "unmeasured",
        evidence: [unit("transform.test.ts"), unit("crop.test.ts"), story("AspectRatios")],
      },
      {
        capability: "Straighten",
        pixen:
          "±45° free rotation, with the crop kept inside the rotated picture by an inscribed-rectangle " +
          "solve rather than a search",
        verdict: "unmeasured",
        evidence: [unit("straighten.test.ts"), story("Straighten"), browser("editor.spec.ts")],
        note: "Two inequalities, from `docs/PROVENANCE.md`: no iteration, so the slider cannot stutter",
      },
      {
        capability: "Rotate and flip",
        pixen: "Quarter turns either way and both flips; the crop and every layer are carried through",
        verdict: "unmeasured",
        evidence: [unit("commands.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Resize on export",
        pixen: `A target size with ${list(RESIZE_FITS)} fitting, and step-down halving so a large reduction keeps its detail`,
        verdict: "met",
        market: required(
          "export pipeline",
          "The output is resized to a target size, with a fit mode deciding how it is reached",
        ),
        evidence: [unit("processing.test.ts"), story("Output"), browser("editor.spec.ts")],
      },
      {
        capability: "Zoom, pan, pinch, fit",
        pixen:
          "Wheel and two-finger pinch, drag to pan, a fit button, and a refit when the container changes " +
          "size — measured from the chrome's own boxes rather than a constant",
        verdict: "unmeasured",
        evidence: [unit("view.test.ts"), unit("touch.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Every gesture is one undo step",
        pixen:
          "A drag opens a transaction and closes it on release, so a hundred pointermoves undo as one — " +
          "and a gesture that cannot start rolls its own back rather than the one already open",
        verdict: "unmeasured",
        evidence: [unit("history.test.ts"), unit("gestures.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "The coordinate model",
        pixen:
          "image · stage · output · view, converted only through `geometry/spaces.ts`, which is why the " +
          "same crop means the same thing to the renderer, the exporter and the pointer",
        verdict: "beyond",
        evidence: [unit("geometry.test.ts"), doc("docs/ARCHITECTURE.md")],
        note: "An architectural property rather than a feature: nothing in the supplied material asked for it",
      },
    ],
  },
];
