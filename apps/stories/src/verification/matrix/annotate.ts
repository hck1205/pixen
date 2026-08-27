/**
 * What is drawn on top, how it is styled, and how something is hidden.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, list, required, story, unit, visual, type ClaimGroup } from "../claim.js";
import {
  ADJUSTMENT_KEYS,
  ADJUSTMENT_PRESETS,
  FRAME_STYLES,
  LINE_ENDS,
  REDACTION_MODES,
  WATERMARK_POSITIONS,
} from "@pixen/core";
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
        pixen: "Gamma, and white balance on both axes — temperature and tint",
        verdict: "met",
        market: required("adjustments", "Colour controls beyond the filter primitives the canvas exposes"),
        evidence: [unit("pixel-adjustments.test.ts"), story("Adjustments"), doc("docs/ROADMAP.md")],
        note:
          "A filter chain is a fixed set of functions and neither a gamma curve nor a channel gain is " +
          "among them, so these cost a pass over every pixel whatever engine is drawing. `adjustmentPlan` " +
          "is what keeps the two engines agreeing: with a filter the browser does what it can and these " +
          "run after it, without one everything runs in the pass — and the same file comes out either way",
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
        pixen: list(LINE_ENDS),
        verdict: "met",
        market: required(
          "shape styles",
          "Eight decorations available at each end independently: none, a bar, an open and a solid arrow, " +
          "an open and a solid circle, an open and a solid square",
        ),
        evidence: [unit("decoration.test.ts"), story("Styling")],
        note:
          "Eight at each end, independently. The open and solid pairs are the same shape stroked or " +
          "filled, which is a real distinction over a busy photograph — and what decides how far the " +
          "shaft stops short, since a solid decoration hides what is under it and an open one does not",
      },
      {
        capability: "Styles a host defines",
        pixen:
          "A shape rule can return any layers it likes, so an application's own decoration is a rule " +
          "rather than a fork — the same seam the preview and the file both go through",
        verdict: "met",
        market: required(
          "shape styles",
          "The default end and frame styles can be merged with a host's own, so an application adds " +
          "decorations the SDK never shipped",
        ),
        evidence: [unit("preprocess.test.ts"), browser("editor.spec.ts"), doc("docs/PLUGINS.md")],
        note:
          "Not a style registry: a host that wants a dashed double arrow writes the shapes for it rather " +
          "than registering a name Pixen would then have to draw",
      },
      {
        capability: "A shape preprocessor",
        pixen:
          "`shapeProcessors` is a chain over each layer on its way to being drawn: return nothing to pass, " +
          "or the layers to draw in its place. It runs over a copy, so the stored document is untouched " +
          "and undo still means what it said",
        verdict: "met",
        market: required(
          "shape styles",
          "A chain of processors run over each shape before it is drawn — to the screen and to the output — " +
          "each one able to expand one shape into several, told whether this is the preview or the file, " +
          "and leaving the stored shape untouched",
        ),
        evidence: [unit("preprocess.test.ts"), browser("editor.spec.ts"), doc("docs/PLUGINS.md")],
        note:
          "Told whether it is drawing the preview or the file, because \"not in the export\" and \"not on " +
          "screen\" are different requests — a draft watermark is the first one. The chain runs each rule " +
          "over what the last produced rather than all of them over the original, which would double a " +
          "shape the moment two of them matched it",
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
        pixen: `${list(FRAME_STYLES)} — with colour, width, inset, radius, spacing, count and arm length`,
        verdict: "met",
        market: required(
          "shape styles",
          "Six treatments — a solid border, corner hooks, a line or a line per edge inset from the crop, a " +
          "nine-slice frame built from a supplied image, and a polaroid — each with its own tuning: " +
          "colour, inset, offset, line count, thickness, hook length, radius, and the slice coordinates",
        ),
        evidence: [unit("decoration.test.ts"), story("Decoration"), visual("visual.spec.ts")],
        note:
          "Six, and the panel offers each treatment only the measurements it reads — a slider that changes " +
          "nothing says the setting does something. Two of the supplied set are not here: a nine-slice " +
          "frame needs an image per frame, and a polaroid needs the picture drawn smaller inside the card " +
          "rather than a border over it. Both are compositions rather than decorations",
      },
      {
        capability: "Retouch",
        pixen:
          "A spot remover: the ellipse inscribed in a rectangle, healed by diffusing the boundary " +
          "inwards. No colour is invented — every value is made of pixels that were already there — " +
          "and it is a layer, so a repair undoes, moves and survives a round trip",
        verdict: "met",
        market: required("plugins", "A retouch tool for removing blemishes"),
        evidence: [unit("heal.test.ts"), browser("editor.spec.ts")],
        note:
          "There is no texture in it: a blemish over a striped shirt heals to a smear rather than to " +
          "stripes. That is the honest limit of anything that runs in a millisecond, and the reason " +
          "this is a spot remover rather than content-aware fill",
      },
      {
        capability: "A colour matrix",
        pixen:
          "Twenty numbers, in the order the platform's own colour matrices use, so one copied from a " +
          "stylesheet or an SVG filter means here what it meant there. Stored in the document, " +
          "undoable, and refused when it is the wrong shape rather than quietly ignored",
        verdict: "met",
        market: required("image properties", "A colour matrix may be set on the image"),
        evidence: [unit("colour-matrix.test.ts"), browser("editor.spec.ts")],
        note:
          "It reaches the alpha channel, which none of the twelve named adjustments can — and it is " +
          "the only colour operation here that needs a pixel pass on every frame, so it is a thing to " +
          "reach for rather than a thing to leave on",
      },
    ],
  },
];
