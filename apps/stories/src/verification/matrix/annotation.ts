/**
 * What is drawn on top and how it is styled: tools, text, handles, the layer stack.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, list, required, story, unit, type ClaimGroup } from "../claim.js";
import { LINE_ENDS } from "@pixen/core";
import { DEFAULT_TOOLS } from "@pixen/web";

export const ANNOTATION_CLAIMS: ClaimGroup = {
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
  };
