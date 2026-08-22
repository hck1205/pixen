/**
 * What is drawn on top, how it is styled, and how something is hidden.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, list, required, story, unit, visual, type ClaimGroup } from "../claim.js";
import { ADJUSTMENT_KEYS, ADJUSTMENT_PRESETS, FRAME_STYLES, REDACTION_MODES, WATERMARK_POSITIONS } from "@pixen/core";
import { DEFAULT_TOOLS } from "@pixen/web";

export const ANNOTATE_CLAIMS: ClaimGroup[] = [
  {
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
        pixen: "Not offered: gamma and white balance need a pass Pixen does not run until there is a GPU renderer",
        verdict: "open",
        market: required("adjustments", "Colour controls beyond the filter primitives the canvas exposes"),
        evidence: [doc("docs/ROADMAP.md")],
      },
    ],
  },
  {
    title: "Annotation",
    summary: "The layers a person draws, and the styling surface each kind offers.",
    claims: [
      {
        capability: "Tools",
        pixen: list(DEFAULT_TOOLS.map((tool) => tool.id)),
        verdict: "unmeasured",
        evidence: [unit("gestures.test.ts"), story("Tools"), browser("editor.spec.ts")],
      },
      {
        capability: "Styling",
        pixen:
          "Stroke colour and width, fill or hollow, dashes, corner radius, font size, alignment, a text " +
          "plate, and both arrow ends — offered per layer kind rather than as one panel of everything",
        verdict: "unmeasured",
        evidence: [unit("style-controls.test.ts"), story("Styling"), browser("editor.spec.ts")],
        note:
          "Which controls appear is a pure function of the tool and the selection, and so is which layer " +
          "each control may write to — a rectangle can no longer be given a text alignment",
      },
      {
        capability: "Text on the canvas",
        pixen:
          "Typed where it sits rather than in a side panel: the layer hides behind its editor so there is " +
          "one copy on screen, and creating plus typing collapse into a single undo step",
        verdict: "unmeasured",
        evidence: [unit("text-box.test.ts"), story("Annotations"), browser("editor.spec.ts")],
      },
      {
        capability: "Line ends",
        pixen: "An arrow head at either end, or neither — one style, chosen per end",
        verdict: "open",
        market: required(
          "shape styles",
          "Eight decorations available at each end independently: none, a bar, an open and a solid arrow, " +
          "an open and a solid circle, an open and a solid square",
        ),
        evidence: [unit("decoration.test.ts"), story("Styling")],
        note:
          "Both ends are already independent and the head is drawn from trigonometry, so the shape of the " +
          "gap is six more head shapes rather than a mechanism",
      },
      {
        capability: "Styles a host defines",
        pixen: "Not offered: the end and frame styles are the ones Pixen draws",
        verdict: "open",
        market: required(
          "shape styles",
          "The default end and frame styles can be merged with a host's own, so an application adds " +
          "decorations the SDK never shipped",
        ),
        evidence: [doc("docs/PLUGINS.md")],
        note: "The same seam the shape preprocessor above wants, seen from the styling side",
      },
      {
        capability: "A shape preprocessor",
        pixen: "Not offered: a host cannot yet transform a shape between the gesture and the document",
        verdict: "open",
        market: required(
          "shape styles",
          "A chain of processors run over each shape before it is drawn — to the screen and to the output — " +
          "each one able to expand one shape into several, told whether this is the preview or the file, " +
          "and leaving the stored shape untouched",
        ),
        evidence: [doc("docs/PLUGINS.md")],
        note:
          "It is the mechanism the end styles and the frame styles are built on in the supplied material, " +
          "which is why those two rows are open as well: one seam, three features",
      },
      {
        capability: "Selection handles",
        pixen:
          "Resize from eight handles and rotate from one, about the layer's own centre, with the opposite " +
          "corner pinned on screen so a rotated layer does not swim away from the pointer",
        verdict: "unmeasured",
        evidence: [unit("transform.test.ts"), story("LayerHandles"), browser("editor.spec.ts")],
      },
      {
        capability: "The layer stack",
        pixen: "Reorder, hide, lock, delete; topmost first, which is the opposite of the paint order",
        verdict: "unmeasured",
        evidence: [unit("layer-rows.test.ts"), story("Layers"), browser("editor.spec.ts")],
      },
    ],
  },
  {
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
          "The mask is the same draw-op list the picture is drawn from, recoloured rather than re-derived, " +
          "which is only possible because ops are data. Two of the supplied options have no equivalent: " +
          "cropping the canvas to the mask's own bounds, and forcing it square",
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
        pixen: `${list(FRAME_STYLES)} — with colour, width, inset and corner radius`,
        verdict: "open",
        market: required(
          "shape styles",
          "Six treatments — a solid border, corner hooks, a line or a line per edge inset from the crop, a " +
          "nine-slice frame built from a supplied image, and a polaroid — each with its own tuning: " +
          "colour, inset, offset, line count, thickness, hook length, radius, and the slice coordinates",
        ),
        evidence: [unit("decoration.test.ts"), story("Decoration"), visual("visual.spec.ts")],
        note:
          "Three of the six are drawn, and they are the three that are geometry rather than decoration. " +
          "The nine-slice one is the interesting gap: it needs an image resource per frame, which the " +
          "document model can carry today and the frame settings cannot",
      },
    ],
  },
];
