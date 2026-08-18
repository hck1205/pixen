import type { Point, Rect } from "../geometry/types.js";

export const SCHEMA_VERSION = 1;

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp";

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

export type EditorLayer = RectLayer | EllipseLayer | LineLayer | PathLayer | TextLayer;
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

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
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
  layers: EditorLayer[];
  output: OutputSettings;
  /** Host-owned data. Pixen round-trips it and never reads it. */
  meta: Record<string, unknown>;
}

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
});

export const DEFAULT_OUTPUT: Readonly<OutputSettings> = Object.freeze({
  width: null,
  height: null,
  format: null,
  quality: 0.85,
  background: null,
});
