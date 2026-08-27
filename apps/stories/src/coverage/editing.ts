/**
 * What an edit is made of: geometry, colour, the things drawn on top,
 * and the stack they live in.
 *
 * One slice of the coverage table. See `coverage/index.ts` for what the table
 * is and the rules it is kept honest by.
 */
import { browser, doc, list, story, unit, type CoverageGroup } from "./evidence.js";
import {
  ADJUSTMENT_KEYS,
  ADJUSTMENT_PRESETS,
  FRAME_STYLES,
  LINE_ENDS,
  REDACTION_MODES,
  WATERMARK_POSITIONS,
} from "@pixen/core";
import { DEFAULT_ASPECT_RATIOS, DEFAULT_TOOLS } from "@pixen/web";

export const EDITING_COVERAGE: CoverageGroup[] = [
  {
    title: "Geometry",
    summary: "Everything that changes where the pixels are rather than what colour they are.",
    entries: [
      {
        capability: "A colour transform of the host's own",
        layer: "Engine",
        detail:
          "Twenty numbers in the order the platform's own colour matrices use, applied after the " +
          "named adjustments and before the vignette. The twelve sliders are a vocabulary; a film " +
          "emulation, a house grade or a duotone is one matrix and none of them is a slider",
        evidence: [unit("colour-matrix.test.ts"), browser("editor.spec.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "Retouch",
        layer: "Engine",
        detail:
          "A blemish is taken out by growing the surroundings over it: every pixel in the spot reads " +
          "the four boundaries along its own rays and takes them weighted by nearness, so no colour " +
          "is invented and the gradient carries through. It is a layer, so a repair undoes and " +
          "survives a saved document — the source bitmap is never written to",
        evidence: [unit("heal.test.ts"), browser("editor.spec.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "A crop that may hang off the picture",
        layer: "Engine",
        detail:
          "A square cut from a panorama keeps its ends, and a rotated picture keeps its corners " +
          "instead of being zoomed in to hide them. What lies outside is the background colour and " +
          "the backdrop; restoring the rule brings an overhanging crop home rather than leaving the " +
          "document in a state its own rule forbids",
        evidence: [unit("lifecycle.test.ts"), browser("editor.spec.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "A bitmap behind the picture",
        layer: "Engine",
        detail:
          "Scaled to cover the exported frame and centred, over the background colour and under the " +
          "photograph — a backdrop that letterboxed would be a border, and a border is what the frame " +
          "is for. The adjustments reach it only when the document says so",
        evidence: [browser("editor.spec.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "A layer belongs to the picture or to the frame",
        layer: "Engine",
        detail:
          "`space: \"image\"` rides the rotation and the flips, so a caption across someone's face " +
          "stays there when the photograph is turned. `space: \"output\"` is the exported file's own " +
          "pixels — it does not turn with the picture and does not move when the crop does, which is " +
          "what a watermark or a caption bar wants",
        evidence: [unit("scene.test.ts"), unit("decoration.test.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "Crop",
        layer: "Engine",
        detail: `Drag and handles; ratios ${list(DEFAULT_ASPECT_RATIOS.map((ratio) => ratio.label))}`,
        evidence: [unit("crop.test.ts"), story("AspectRatios"), browser("editor.spec.ts")],
      },
      {
        capability: "Straighten",
        layer: "Engine",
        detail: "±45°, with the crop kept inside the rotated image by an inscribed-rectangle solve",
        evidence: [unit("straighten.test.ts"), story("Straighten"), browser("editor.spec.ts")],
      },
      {
        capability: "Rotate and flip",
        layer: "Engine",
        detail: "Quarter turns either way, horizontal and vertical flip; layers follow the document",
        evidence: [unit("commands.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Zoom, pan, pinch, fit",
        layer: "Element",
        detail: "Wheel and two-finger pinch zoom, drag to pan, fit-on-resize, and a fit button",
        evidence: [unit("view.test.ts"), unit("touch.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Coordinate spaces",
        layer: "Engine",
        detail: "image · stage · output · view, converted only through geometry/spaces.ts",
        evidence: [unit("geometry.test.ts"), doc("docs/ARCHITECTURE.md")],
      },
    ],
  },
  {
    title: "Colour",
    summary: "The adjustments, and the named looks built from them.",
    entries: [
      {
        capability: "Adjustments",
        layer: "Engine",
        detail: list(ADJUSTMENT_KEYS),
        evidence: [unit("scene.test.ts"), story("Adjustments")],
      },
      {
        capability: "Presets",
        layer: "Engine",
        detail: list(ADJUSTMENT_PRESETS.map((preset) => preset.label)),
        evidence: [unit("scene.test.ts"), story("Presets")],
      },
      {
        capability: "Filter fallback",
        layer: "Engine",
        detail: "Canvas filters where supported, a per-pixel pass where they are not",
        evidence: [unit("scene.test.ts"), doc("docs/BROWSER-SUPPORT.md")],
      },
    ],
  },
  {
    title: "Annotation",
    summary: "What can be drawn on the picture, and how each mark is styled.",
    entries: [
      {
        capability: "Tools",
        layer: "Element",
        detail: list(DEFAULT_TOOLS.map((tool) => tool.id)),
        evidence: [unit("gestures.test.ts"), story("Tools")],
      },
      {
        capability: "Layer kinds",
        layer: "Engine",
        detail: "rect, ellipse, line with either arrowhead, path, text, image, redaction",
        evidence: [unit("layers.test.ts"), unit("ops.test.ts"), story("Annotations")],
      },
      {
        capability: "Styling",
        layer: "Element",
        detail: "Stroke colour and width, fill, dashes, corner radius, type size, alignment, text plate",
        evidence: [unit("style-controls.test.ts"), story("Styling")],
      },
      {
        capability: "Text on canvas",
        layer: "Element",
        detail: "Edited where it sits; creating and typing collapse into one undo step",
        evidence: [unit("text-box.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Stickers",
        layer: "Element",
        detail:
          "Host-supplied artwork, decoded once and referenced by id however often it is placed — which " +
          "is what keeps a document with ten stickers small JSON rather than ten bitmaps, and is now " +
          "checked by placing the same one twice",
        evidence: [unit("stickers.test.ts"), story("Stickers"), browser("editor.spec.ts")],
      },
      {
        capability: "Handles",
        layer: "Element",
        detail:
          "Corner resize and a rotate grip, both one undo step per gesture, and arrow-key nudge — " +
          "which moves the selected layer, and does nothing without one, so the page can still scroll",
        evidence: [unit("transform.test.ts"), unit("keyboard.test.ts"), story("LayerHandles"), browser("editor.spec.ts")],
      },
    ],
  },
  {
    title: "Redaction",
    summary: "Hiding what should not leave the browser, and being honest about which modes truly remove it.",
    entries: [
      {
        capability: "Modes",
        layer: "Engine",
        detail: list(REDACTION_MODES),
        evidence: [unit("layers.test.ts"), story("RedactionModes"), browser("editor.spec.ts")],
      },
      {
        capability: "Only solid removes information",
        layer: "Engine",
        detail: "Blur and pixelate obscure; the default is solid, and the documentation says why",
        evidence: [unit("layers.test.ts"), doc("docs/SECURITY.md")],
      },
      {
        capability: "Scrambling",
        layer: "Engine",
        detail:
          "Averages the region into blocks and then permutes them, so the arrangement a block-for-block " +
          "comparison attack depends on is gone. The order comes from the layer's id, so preview and " +
          "export always agree",
        evidence: [unit("scramble.test.ts"), browser("editor.spec.ts"), doc("docs/SECURITY.md")],
      },
      {
        capability: "Strength survives a rotation",
        layer: "Engine",
        detail:
          "The strength is measured in image pixels and applied in device pixels, so it travels through " +
          "the render transform — a rotated picture is redacted exactly as hard as an upright one",
        evidence: [unit("redaction.test.ts")],
      },
    ],
  },
  {
    title: "Decoration",
    summary: "Marks that belong to the finished picture rather than to the editing session.",
    entries: [
      {
        capability: "Watermark placement",
        layer: "Engine",
        detail: list(WATERMARK_POSITIONS),
        evidence: [
          unit("decoration.test.ts"),
          unit("layers.test.ts"),
          story("Watermark"),
          browser("editor.spec.ts"),
        ],
      },
      {
        capability: "Text watermark",
        layer: "Engine",
        detail: "A text layer placed by the same rules, so it needs no bitmap",
        evidence: [unit("decoration.test.ts")],
      },
      {
        capability: "Frames",
        layer: "Engine",
        detail: list(FRAME_STYLES),
        evidence: [unit("frames.test.ts"), unit("decoration.test.ts"), story("Decoration")],
      },
      {
        capability: "Line ends",
        layer: "Engine",
        detail: list(LINE_ENDS),
        evidence: [unit("line-ends.test.ts"), story("Styling")],
      },
      {
        capability: "Host shape rules",
        layer: "Engine",
        detail:
          "A chain over each layer on its way to being drawn — pass, replace, expand or drop — told " +
          "whether it is drawing the preview or the file, and running over a copy so the document is untouched",
        evidence: [unit("preprocess.test.ts"), browser("editor.spec.ts"), doc("docs/PLUGINS.md")],
      },
    ],
  },
  {
    title: "Layers",
    summary: "The list of everything added, and what can be done to a row of it.",
    entries: [
      {
        capability: "Layer panel",
        layer: "Element",
        detail: "Top-first list: select, show or hide, lock or unlock, bring forward, send backward, delete",
        evidence: [unit("layer-rows.test.ts"), story("Layers")],
      },
      {
        capability: "Per-layer properties",
        layer: "Engine",
        detail: "Opacity, rotation about its own centre, visibility, lock, name",
        evidence: [unit("layers.test.ts"), unit("transform.test.ts")],
      },
      {
        capability: "Locked layers are inert",
        layer: "Element",
        detail: "Not hit-tested and drawn without handles, so a locked mark cannot be nudged by accident",
        evidence: [unit("gestures.test.ts"), story("Layers")],
      },
    ],
  },
];
