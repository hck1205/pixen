/**
 * Hiding and decorating: redaction, masks, watermarks, stickers, frames, retouch, the colour matrix.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, list, required, story, unit, visual, type ClaimGroup } from "../claim.js";
import { FRAME_STYLES, REDACTION_MODES, WATERMARK_POSITIONS } from "@pixen/core";

export const HIDING_CLAIMS: ClaimGroup = {
    title: "Hiding and decorating",
    summary: "Taking something out of the picture, and putting something over all of it.",
    claims: [
      {
        capability: "Redaction",
        pixen: list(REDACTION_MODES),
        verdict: "met",
        market: required(
          "scrambler",
          "A redaction that cannot be undone: the region is reduced to a mosaic, its pixels are moved " +
          "about, and the result is blurred — with the scramble and the blur each tunable",
        ),
        evidence: [unit("redaction.test.ts"), unit("scramble.test.ts"), story("RedactionModes")],
        note:
          "Ours permutes whole mosaic blocks rather than offsetting pixels, and the permutation is seeded " +
          "from the layer's id rather than taken from a random number — because an editor whose preview " +
          "does not match the file it exports is broken, and both are drawn from the same document. Only " +
          "`solid` removes the information outright, which `docs/SECURITY.md` says rather than leaving a " +
          "customer to assume otherwise",
      },
      {
        capability: "Masks",
        pixen:
          "The marked areas as a flat mask image — a canvas or a blob, foreground and background colours, " +
          "transparency, and padding around each mark for an inpainting model to work into",
        verdict: "met",
        market: required(
          "selection to mask",
          "The marked selection turned into a mask, as a canvas or a blob, with its colours, its padding " +
          "and its size under the host's control",
        ),
        evidence: [unit("mask.test.ts"), story("Mask"), browser("editor.spec.ts")],
        note:
          "The colours, the padding and the size are options; a blob is `toBlob` on the canvas handed " +
          "back. The mask is the same draw-op list the picture is drawn from, recoloured rather than re-derived, " +
          "which is only possible because ops are data. Two of the supplied options have no equivalent: " +
          "cropping the canvas to the mask's own bounds, and forcing it square",
      },
      {
        capability: "A mask cut to its own bounds",
        pixen: "The mask is the size of the output, or the size a host asks for, with the marks where they fall",
        verdict: "open",
        market: required(
          "image exports",
          "A mask may be returned fitted to the marks alone rather than to the whole image, with a " +
          "ceiling on its size and a choice of how precisely its bounds are found",
        ),
        evidence: [unit("mask.test.ts")],
        note:
          "What an inpainting service is sent: the region and its margin, not a mostly-black canvas the " +
          "size of the photograph. The bounds are a union of the marks' rects grown by the padding, which " +
          "`layerBounds` already answers; the ceiling is a `scaleToFit`. The precision knob is theirs " +
          "because their bounds are found by scanning pixels, and ours would not be",
      },
      {
        capability: "Watermarks",
        pixen: `Image or text, at ${list(WATERMARK_POSITIONS)}, or tiled, with opacity and a margin`,
        verdict: "unmeasured",
        evidence: [unit("processing.test.ts"), story("Watermark"), visual("visual.spec.ts")],
      },
      {
        capability: "Stickers",
        pixen: "Host-supplied artwork placed in the middle of the visible crop; Pixen ships none of its own",
        verdict: "unmeasured",
        evidence: [unit("stickers.test.ts"), story("Stickers"), browser("editor.spec.ts")],
      },
      {
        capability: "Frames",
        pixen: `${list(FRAME_STYLES)} — with colour, width, inset, radius, spacing, count and arm length`,
        verdict: "met",
        market: required(
          "image exports",
          "A solid border, corner hooks, a line or a line per edge inset from the crop — each with its " +
          "own tuning: colour, inset, offset, line count, thickness, hook length and radius",
        ),
        evidence: [unit("decoration.test.ts"), story("Decoration"), visual("visual.spec.ts")],
        note:
          "Six here, four of them the supplied ones and two of our own. The panel offers each treatment " +
          "only the measurements it reads — a slider that changes nothing says the setting does " +
          "something. The two supplied treatments that are not drawn borders have the next row",
      },
      {
        capability: "A frame that is a picture",
        pixen: "Every frame is lines drawn over the crop in one colour",
        verdict: "open",
        market: required(
          "image exports",
          "A frame built from a supplied image cut into nine slices, and a polaroid that draws the " +
          "picture smaller inside a card",
        ),
        evidence: [unit("frames.test.ts")],
        note:
          "Both are compositions rather than decorations: the nine-slice needs a bitmap per frame and the " +
          "polaroid needs the picture itself moved and shrunk, which no other frame does. The bitmap " +
          "half has a seam already — a frame image is a resource like a backdrop — and the polaroid is a " +
          "second use of the output-space placement a watermark uses. Neither is small",
      },
      {
        capability: "Retouch",
        pixen:
          "A spot remover: the ellipse inscribed in a rectangle, healed by diffusing the boundary " +
          "inwards. No colour is invented — every value is made of pixels that were already there — " +
          "and it is a layer, so a repair undoes, moves and survives a round trip",
        verdict: "met",
        market: required("plugins", "A retouch tool for removing blemishes"),
        evidence: [unit("heal.test.ts"), unit("canvas-pixels.test.ts"), browser("editor.spec.ts")],
        note:
          "There is no texture in it: a blemish over a striped shirt heals to a smear rather than to " +
          "stripes. That is the honest limit of anything that runs in a millisecond, and the reason " +
          "this is a spot remover rather than content-aware fill",
      },
      {
        capability: "A scrambler a host writes",
        pixen: "Scrambling is ours: whole mosaic blocks permuted, seeded from the layer's id",
        verdict: "open",
        market: required(
          "image properties",
          "The scrambling step may be replaced by a host function, which is handed the pixels and " +
          "returns scrambled pixels",
        ),
        evidence: [unit("scramble.test.ts")],
        note:
          "The seam is not free here, and the reason is `docs/SECURITY.md`: the preview and the export " +
          "must agree, so a host function would have to be pure and deterministic and we would have no " +
          "way to hold it to that. A replaceable scrambler that ran once and differently on the second " +
          "pass would ship a redaction that hides one thing on screen and another in the file",
      },
      {
        capability: "How a redaction is resampled",
        pixen: "Blocks are drawn hard-edged, which is what a mosaic is",
        verdict: "open",
        market: required(
          "image properties",
          "Whether a redaction is drawn hard-edged or smoothed is a host setting, because one engine " +
          "cannot smooth it",
        ),
        evidence: [unit("redaction.test.ts")],
        note:
          "Ours chooses per mode rather than per host — the blur smooths, the mosaic does not — so the " +
          "setting has nothing to switch today. It becomes real the moment a host wants a soft mosaic",
      },
      {
        capability: "A bright vignette",
        pixen: "The vignette darkens, from nothing to full",
        verdict: "open",
        market: required("image properties", "A vignette may lighten the edges as well as darken them"),
        evidence: [unit("adjustments.test.ts")],
        note:
          "The slider runs 0 to 1 rather than -1 to 1. The drawing already paints a radial gradient " +
          "over the picture, so the negative half is a colour and a composite mode rather than a new " +
          "operation — it is missing because nobody asked, not because it is hard",
      },
      {
        capability: "A colour matrix",
        pixen:
          "Twenty numbers, in the order the platform's own colour matrices use, so one copied from a " +
          "stylesheet or an SVG filter means here what it meant there. Stored in the document, " +
          "undoable, and refused when it is the wrong shape rather than quietly ignored",
        verdict: "met",
        market: required("image properties", "A colour matrix may be set on the image"),
        evidence: [unit("colour-matrix.test.ts"), unit("canvas-pixels.test.ts"), browser("editor.spec.ts")],
        note:
          "It reaches the alpha channel, which none of the twelve named adjustments can — and it is " +
          "the only colour operation here that needs a pixel pass on every frame, so it is a thing to " +
          "reach for rather than a thing to leave on. The supplied material keeps several matrices at " +
          "once, one per stage of its own pipeline; ours is one matrix, because the stages it would " +
          "key them by are the twelve named adjustments and those are stored as their own values",
      },
    ],
  };
