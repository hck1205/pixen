import type { IconName } from "../theme/index.js";
import type { PixenStrings } from "../i18n/index.js";
import type { ToolId } from "../tools/index.js";

/**
 * Every number and identifier the chrome depends on, named and in one place.
 *
 * A literal buried in a call site is a decision nobody can find again. These are
 * the decisions: which attributes are observed, how far a keypress nudges a
 * layer, how coarse a slider is, what counts as "the same ratio".
 */

/** Attributes the element reacts to. Structured values are properties instead. */
export const OBSERVED_ATTRIBUTES = ["src", "theme", "locale", "format", "quality", "preset"] as const;

/** Adding one here without handling it in the element fails to compile. */
export type ObservedAttribute = (typeof OBSERVED_ATTRIBUTES)[number];

/**
 * The attributes that describe the file coming out rather than the picture
 * going in. They are re-applied after every load, because they mean nothing
 * until there is a document to apply them to.
 */
export const OUTPUT_ATTRIBUTES = ["format", "quality"] as const satisfies readonly ObservedAttribute[];

/** The inspector shows one of these at a time. */
export type PanelId = "tool" | "adjust" | "layers" | "output";

/**
 * What a panel is called when it opens.
 *
 * The tool panel has no name of its own — it is whichever tool is armed — so it
 * is announced by the tool instead, which is why this is nullable rather than a
 * string everywhere.
 */
export const PANEL_LABEL_KEYS: Record<PanelId, keyof PixenStrings | null> = {
  tool: null,
  adjust: "adjustments",
  layers: "layers",
  output: "output",
};

export interface AspectRatioOption {
  label: string;
  value: number | null;
}

export const DEFAULT_ASPECT_RATIOS: readonly AspectRatioOption[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
];

/** Labels for the ratios a host is likely to pass as bare numbers. */
export const KNOWN_RATIO_LABELS: ReadonlyArray<readonly [number, string]> = [
  [1, "1:1"],
  [4 / 3, "4:3"],
  [3 / 2, "3:2"],
  [16 / 9, "16:9"],
  [3 / 4, "3:4"],
  [2 / 3, "2:3"],
  [9 / 16, "9:16"],
];

export const FREEFORM_RATIO_LABEL = "Free";

/** Ratios closer than this are the same ratio, whatever the float says. */
export const RATIO_TOLERANCE = 0.0001;

export interface ToolMeta {
  icon: IconName;
  key: keyof PixenStrings;
  /** Single-key shortcut, lower case. */
  shortcut: string;
}

export const TOOL_META: Readonly<Record<ToolId, ToolMeta>> = {
  crop: { icon: "crop", key: "crop", shortcut: "c" },
  select: { icon: "select", key: "select", shortcut: "v" },
  rect: { icon: "rectangle", key: "rectangle", shortcut: "r" },
  ellipse: { icon: "ellipse", key: "ellipse", shortcut: "o" },
  arrow: { icon: "arrow", key: "arrow", shortcut: "a" },
  draw: { icon: "draw", key: "draw", shortcut: "d" },
  text: { icon: "text", key: "text", shortcut: "t" },
  sticker: { icon: "sticker", key: "sticker", shortcut: "s" },
  redact: { icon: "redact", key: "redact", shortcut: "x" },
};

/** One press of the zoom buttons. */
export const ZOOM_STEP = 1.25;

/** Arrow-key nudge, as a fraction of the image width, and its shift multiplier. */
export const NUDGE_FRACTION = 1 / 500;
export const NUDGE_FAST_MULTIPLIER = 10;

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

/** Stroke width, as a fraction of the image's longest edge. */
export const STROKE_WIDTH_RANGE: SliderRange = { min: 0.001, max: 0.02, step: 0.001 };

/** Corner rounding, as a fraction of a rectangle's shorter side. */
export const CORNER_RATIO_RANGE: SliderRange = { min: 0, max: 0.5, step: 0.01 };

/** Type size, as a fraction of the image's longest edge. */
export const FONT_RATIO_RANGE: SliderRange = { min: 0.01, max: 0.15, step: 0.005 };

/** Layer opacity, and rotation in degrees — the inspector's two layer sliders. */
export const OPACITY_RANGE: SliderRange = { min: 0, max: 1, step: 0.05 };
export const ROTATION_RANGE: SliderRange = { min: -180, max: 180, step: 1 };

/** Encoder quality, for the formats that have one. */
export const OUTPUT_QUALITY_RANGE: SliderRange = { min: 0.3, max: 1, step: 0.01 };

/** Straighten, in degrees. The engine clamps to the same ±45°. */
export const STRAIGHTEN_RANGE: SliderRange = { min: -45, max: 45, step: 0.5 };

/** Shortcut hints shown on the action buttons. */
export const UNDO_KEY_SHORTCUTS = "Control+Z Meta+Z";
export const REDO_KEY_SHORTCUTS = "Control+Shift+Z Meta+Shift+Z";
