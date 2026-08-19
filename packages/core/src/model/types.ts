import type { Point, Rect } from "../geometry/types.js";
import { DEFAULT_QUALITY } from "./defaults.js";

export const SCHEMA_VERSION = 4;

/**
 * Every format Pixen encodes, as the list rather than as a union — the same
 * pattern as `FRAME_STYLES` and `REDACTION_MODES`, so a picker, a validator and
 * a format probe can all be built from it instead of restating it.
 */
export const IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export interface Stroke {
  color: string;
  width: number;
  /** Dash pattern in image-space units; empty means solid. */
  dash?: number[];
}

interface LayerBase {
  id: string;
  name?: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  /** Rotation of the layer itself, radians, around its own centre. */
  rotation: number;
}

/** Every layer stores its geometry in image space, so rotate/flip never rewrites it. */
export interface RectLayer extends LayerBase {
  type: "rect";
  frame: Rect;
  stroke: Stroke | null;
  fill: string | null;
  cornerRadius: number;
}

export interface EllipseLayer extends LayerBase {
  type: "ellipse";
  frame: Rect;
  stroke: Stroke | null;
  fill: string | null;
}

export interface LineLayer extends LayerBase {
  type: "line";
  from: Point;
  to: Point;
  stroke: Stroke;
  arrowStart: boolean;
  arrowEnd: boolean;
}

export interface PathLayer extends LayerBase {
  type: "path";
  points: Point[];
  stroke: Stroke;
  closed: boolean;
}

export interface TextLayer extends LayerBase {
  type: "text";
  position: Point;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: "left" | "center" | "right";
  backgroundColor: string | null;
  /** Wrapping width in image space; null lets the line run. */
  maxWidth: number | null;
}

/**
 * A bitmap placed on the image: a sticker, a logo, a watermark.
 *
 * Like the source image, the pixels live in the `ResourceManager` and the layer
 * carries only an id — so a document with ten stickers is still small JSON, and
 * the same bitmap placed twice is decoded once.
 */
export interface ImageLayer extends LayerBase {
  type: "image";
  resourceId: string;
  frame: Rect;
  /** Tiles the bitmap across the frame instead of stretching it once. */
  repeat: boolean;
}

/**
 * How a redaction hides what is underneath.
 *
 * `solid` is the only mode that removes information outright, which is why it is
 * the default; `blur` and `pixelate` obscure, and the difference matters when
 * the content is sensitive. See docs/SECURITY.md.
 */
export const REDACTION_MODES = ["solid", "blur", "pixelate"] as const;
export type RedactionMode = (typeof REDACTION_MODES)[number];

export interface RedactLayer extends LayerBase {
  type: "redact";
  frame: Rect;
  mode: RedactionMode;
  /** Blur radius, or pixel block size, as a fraction of the image's longest edge. */
  strength: number;
  /** Fill used by `solid`, and as the fallback when pixels cannot be read back. */
  colour: string;
}

export type EditorLayer =
  | RectLayer
  | EllipseLayer
  | LineLayer
  | PathLayer
  | TextLayer
  | ImageLayer
  | RedactLayer;
export type LayerType = EditorLayer["type"];

export interface SourceDescriptor {
  resourceId: string;
  width: number;
  height: number;
  /** Best-effort provenance, useful for filenames on export. */
  name?: string;
  mimeType?: string;
}

export interface DocumentTransform {
  /** Clockwise rotation in radians. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

/**
 * Every colour adjustment the document can carry, in the order they are applied
 * and shown.
 *
 * One list is the whole vocabulary: the type, the defaults, the validator, the
 * filter string, the pixel fallback and the inspector all read it, so a new
 * adjustment is added in one place rather than in six that must agree.
 */
export const ADJUSTMENT_KEYS = [
  "exposure",
  "brightness",
  "contrast",
  "saturation",
  "hue",
  "grayscale",
  "sepia",
  "invert",
  "vignette",
] as const;

export type AdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];

/** Every key is a number; what each range means lives in `model/adjustments.ts`. */
export type Adjustments = Record<AdjustmentKey, number>;

/**
 * A decorative border drawn over the finished picture.
 *
 * Document-level rather than a layer: a frame is not something you select and
 * drag, it belongs to the output the way the background colour does — and
 * keeping it out of `layers` means it cannot be reordered under an annotation.
 */
export const FRAME_STYLES = ["solid", "inset", "rounded"] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

export interface FrameSettings {
  style: FrameStyle;
  /** Line thickness as a fraction of the output's longest edge. */
  width: number;
  colour: string;
  /** Corner radius as a fraction of the longest edge; `rounded` only. */
  radius: number;
  /** Distance from the edge, as a fraction of the longest edge; `inset` only. */
  inset: number;
}

export interface OutputSettings {
  /** Resize target in output pixels; null keeps the cropped size. */
  width: number | null;
  height: number | null;
  format: ImageFormat | null;
  quality: number;
  /** Painted under the image; needed when exporting transparency to JPEG. */
  background: string | null;
}

export interface EditorDocument {
  schemaVersion: number;
  source: SourceDescriptor;
  transform: DocumentTransform;
  /** Stage-space crop region. Absent means "the whole stage". */
  crop: Rect | null;
  /** Locked crop ratio, kept in the document so a resumed session behaves the same. */
  aspectRatio: number | null;
  adjustments: Adjustments;
  /** A border drawn over everything, or null for none. */
  frame: FrameSettings | null;
  layers: EditorLayer[];
  output: OutputSettings;
  /** Host-owned data. Pixen round-trips it and never reads it. */
  meta: Record<string, unknown>;
}

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = Object.freeze(
  Object.fromEntries(ADJUSTMENT_KEYS.map((key) => [key, 0])) as Adjustments,
);

export const DEFAULT_OUTPUT: Readonly<OutputSettings> = Object.freeze({
  width: null,
  height: null,
  format: null,
  quality: DEFAULT_QUALITY,
  background: null,
});
