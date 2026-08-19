import {
  ADJUSTMENT_KEYS,
  ADJUSTMENT_PRESETS,
  FRAME_STYLES,
  PRESETS,
  REDACTION_MODES,
  SCHEMA_VERSION,
  WATERMARK_POSITIONS,
} from "@pixen/core";
import {
  DEFAULT_ASPECT_RATIOS,
  DEFAULT_TOOLS,
  OUTPUT_FORMATS,
  availableLocales,
  formatLabel,
} from "@pixen/web";

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
 */
export type CoverageLayer = "Engine" | "Element" | "Bindings";

export type Evidence =
  | { kind: "unit"; file: string }
  | { kind: "browser"; file: string }
  | { kind: "visual"; file: string }
  | { kind: "story"; name: string }
  | { kind: "doc"; file: string };

export interface CoverageEntry {
  capability: string;
  layer: CoverageLayer;
  /** What it is today. Derived from the code wherever the code has a list. */
  detail: string;
  /** What proves it. Empty is not allowed; a claim with no evidence is a claim. */
  evidence: Evidence[];
}

export interface CoverageGroup {
  title: string;
  /** Why this group exists, in one line. */
  summary: string;
  entries: CoverageEntry[];
}

const unit = (file: string): Evidence => ({ kind: "unit", file });
const browser = (file: string): Evidence => ({ kind: "browser", file });
const visual = (file: string): Evidence => ({ kind: "visual", file });
const story = (name: string): Evidence => ({ kind: "story", name });
const doc = (file: string): Evidence => ({ kind: "doc", file });

/** How a piece of evidence reads in the table. */
export function evidenceLabel(evidence: Evidence): string {
  switch (evidence.kind) {
    case "unit":
      return `unit · ${evidence.file}`;
    case "browser":
      return `browser · ${evidence.file}`;
    case "visual":
      return `visual · ${evidence.file}`;
    case "story":
      return `story · ${evidence.name}`;
    case "doc":
      return evidence.file;
  }
}

const list = (values: readonly string[]): string => values.join(", ");

export const COVERAGE: CoverageGroup[] = [
  {
    title: "Getting an image in",
    summary: "Every way a picture reaches the editor, and what is read off it on the way.",
    entries: [
      {
        capability: "Input types",
        layer: "Engine",
        detail: "File, Blob, URL string, ImageBitmap, HTMLImageElement, HTMLCanvasElement, ArrayBuffer",
        evidence: [unit("editor.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Drag and drop, paste, file picker",
        layer: "Element",
        detail: "Drop anywhere on the host, ⌘/Ctrl+V, and the empty state's own button",
        evidence: [unit("transfer.test.ts"), story("EmptyState")],
      },
      {
        capability: "EXIF orientation",
        layer: "Engine",
        detail: "All eight orientations applied at decode, so geometry never sees a rotated source",
        evidence: [unit("exif.test.ts")],
      },
      {
        capability: "Off-thread decode and encode",
        layer: "Engine",
        detail: "A worker built from a blob URL, used above 512 KB in and 1 MP out; falls back in place",
        evidence: [unit("worker.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Decompression-bomb ceiling",
        layer: "Engine",
        detail: "MAX_CANVAS_PIXELS refuses a surface no browser would allocate",
        evidence: [doc("docs/SECURITY.md")],
      },
      {
        capability: "Capability probe",
        layer: "Engine",
        detail: "What this browser actually supports, so a host can degrade deliberately",
        evidence: [unit("support.test.ts"), story("SupportReport"), doc("docs/BROWSER-SUPPORT.md")],
      },
    ],
  },
  {
    title: "Geometry",
    summary: "Everything that changes where the pixels are rather than what colour they are.",
    entries: [
      {
        capability: "Crop",
        layer: "Engine",
        detail: `Drag, handles, keyboard nudge; ratios ${list(DEFAULT_ASPECT_RATIOS.map((ratio) => ratio.label))}`,
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
        detail: "Wheel and pinch zoom, drag to pan, fit-on-resize, and a fit button",
        evidence: [unit("view.test.ts"), browser("editor.spec.ts")],
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
        detail: "Host-supplied artwork, decoded once and referenced by id however often it is placed",
        evidence: [unit("stickers.test.ts"), story("Stickers"), browser("editor.spec.ts")],
      },
      {
        capability: "Handles",
        layer: "Element",
        detail: "Corner resize and a rotate grip, both one undo step per gesture",
        evidence: [unit("transform.test.ts"), story("LayerHandles"), browser("editor.spec.ts")],
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
        evidence: [unit("ops.test.ts"), story("RedactionModes"), browser("editor.spec.ts")],
      },
      {
        capability: "Only solid removes information",
        layer: "Engine",
        detail: "Blur and pixelate obscure; the default is solid, and the documentation says why",
        evidence: [unit("layers.test.ts"), doc("docs/SECURITY.md")],
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
        evidence: [unit("decoration.test.ts"), story("Watermark"), browser("editor.spec.ts")],
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
        evidence: [unit("decoration.test.ts"), story("Decoration")],
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
  {
    title: "Output",
    summary: "What leaves the editor: how big, in what format, and how many files.",
    entries: [
      {
        capability: "Formats",
        layer: "Element",
        detail: list(OUTPUT_FORMATS.map((format) => (format === null ? "auto" : formatLabel(format)))),
        evidence: [unit("output-settings.test.ts"), story("Output")],
      },
      {
        capability: "Resize",
        layer: "Element",
        detail: "Explicit width and height with the ratio linked or free; never upscales past the source",
        evidence: [unit("output-settings.test.ts"), unit("processing.test.ts"), story("Output")],
      },
      {
        capability: "Quality and byte budget",
        layer: "Engine",
        detail: "Quality for the lossy formats, and a maxBytes search that re-encodes until it fits",
        evidence: [unit("processing.test.ts"), story("ExportFlow"), browser("editor.spec.ts")],
      },
      {
        capability: "Multiple sizes",
        layer: "Engine",
        detail: "exportVariants plans the sizes first, drops duplicates, and writes a srcset",
        evidence: [unit("variants.test.ts"), story("Variants")],
      },
      {
        capability: "Downscaling quality",
        layer: "Engine",
        detail: "Halving passes before the final draw, so fine detail averages instead of aliasing",
        evidence: [unit("processing.test.ts")],
      },
      {
        capability: "Editor-free processing",
        layer: "Engine",
        detail: "processImage and processImages, with bounded concurrency and per-item failures",
        evidence: [unit("processing.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Policies",
        layer: "Engine",
        detail: list(Object.keys(PRESETS)),
        evidence: [unit("processing.test.ts"), story("Policies")],
      },
      {
        capability: "Transparency",
        layer: "Engine",
        detail: "Alpha kept where the format has it, and a background painted where it does not",
        evidence: [unit("processing.test.ts"), story("Transparency")],
      },
    ],
  },
  {
    title: "The document",
    summary: "What is stored, and what happens to it when the schema moves.",
    entries: [
      {
        capability: "JSON document",
        layer: "Engine",
        detail: `Schema v${SCHEMA_VERSION}; bitmaps live in the ResourceManager and are referenced by id`,
        evidence: [unit("document.test.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "Validation",
        layer: "Engine",
        detail: "A parse that rejects a malformed document rather than half-loading it",
        evidence: [unit("validate.test.ts")],
      },
      {
        capability: "Migrations",
        layer: "Engine",
        detail: "One registered migration per version step, so an old save opens rather than failing",
        evidence: [unit("document.test.ts"), unit("decoration.test.ts")],
      },
      {
        capability: "History",
        layer: "Engine",
        detail: "Undo and redo with transactions, so one gesture is one step whatever it changed",
        evidence: [unit("history.test.ts"), unit("session.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Save and resume",
        layer: "Engine",
        detail: "toJSON and restore round-trip a session, including host metadata Pixen never reads",
        evidence: [unit("document.test.ts"), story("SaveAndResume")],
      },
    ],
  },
  {
    title: "The interface",
    summary: "Everything about the editor that is not about the picture.",
    entries: [
      {
        capability: "Locales",
        layer: "Element",
        detail: list(availableLocales()),
        evidence: [unit("i18n.test.ts"), story("Locales")],
      },
      {
        capability: "Right to left",
        layer: "Element",
        detail: "Logical properties throughout; numeric readouts pinned to LTR so sizes stay readable",
        evidence: [unit("i18n.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Keyboard",
        layer: "Element",
        detail: "Tool shortcuts, undo and redo, arrow-key nudge with a fast modifier, Escape and Enter",
        evidence: [unit("keyboard.test.ts")],
      },
      {
        capability: "Accessibility",
        layer: "Element",
        detail: "Named controls, aria-pressed toggles, aria-keyshortcuts, and a polite live region",
        evidence: [unit("labels.test.ts")],
      },
      {
        capability: "Theming",
        layer: "Element",
        detail: "Light, dark and system, driven by custom properties on the host",
        evidence: [story("Themes"), story("Theming"), visual("visual.spec.ts")],
      },
      {
        capability: "Slots and parts",
        layer: "Element",
        detail: "Host-supplied toolbar, actions and inspector content; named parts for styling",
        evidence: [story("Slots")],
      },
      {
        capability: "Small hosts",
        layer: "Element",
        detail: "The chrome reflows and the image re-fits around it rather than being covered",
        evidence: [unit("view.test.ts"), story("Compact"), browser("editor.spec.ts")],
      },
      {
        capability: "Plugins",
        layer: "Element",
        detail: "Actions and inspector sections contributed by a host, with a teardown per plugin",
        evidence: [unit("plugins.test.ts"), story("Plugin"), doc("docs/PLUGINS.md")],
      },
    ],
  },
  {
    title: "Integration",
    summary: "How it is dropped into an application.",
    entries: [
      {
        capability: "Frameworks",
        layer: "Bindings",
        detail: "@pixen/react, @pixen/vue, @pixen/svelte, and the custom element for everything else",
        evidence: [unit("bindings.test.ts"), story("ExportFlow"), doc("docs/FRAMEWORKS.md")],
      },
      {
        capability: "Events",
        layer: "Bindings",
        detail: "load, change, history, export and error, as DOM events and as framework props",
        evidence: [unit("bindings.test.ts"), story("EventLog")],
      },
      {
        capability: "Server rendering",
        layer: "Bindings",
        detail: "Every wrapper imports without a DOM and registers the element only in a browser",
        evidence: [unit("ssr.test.ts")],
      },
      {
        capability: "No runtime dependencies",
        layer: "Bindings",
        detail: "Published packages depend on nothing but each other",
        evidence: [unit("independence.test.ts"), doc("CONTRIBUTING.md")],
      },
      {
        capability: "Independent implementation",
        layer: "Engine",
        detail: "Derived from web platform specifications; no competitor code, assets or wording",
        evidence: [unit("independence.test.ts"), doc("docs/PROVENANCE.md")],
      },
    ],
  },
];

/** How many capabilities the page lists, for its own summary line. */
export function coverageCount(): number {
  return COVERAGE.reduce((total, group) => total + group.entries.length, 0);
}
