import type { CropHandle, EditorLayer, Intent, LayerHandle, Matrix, Point, Rect, TextMeasurer } from "@pixen/core";
import type { AnnotationStyle, ToolId } from "../../tools/index.js";

/**
 * The vocabulary of a gesture: what is in progress, what the reducer may know
 * about the world, and what it may ask the host to do about it.
 *
 * State and effects are data, which is what lets every path a drag can take be
 * reachable from a unit test with plain objects.
 */
export type ShapeTool = "rect" | "ellipse" | "arrow" | "redact" | "retouch";

export type GestureState =
  | { kind: "idle" }
  | { kind: "view-pan"; last: Point }
  | { kind: "crop-move"; last: Point }
  | { kind: "crop-resize"; handle: CropHandle }
  | { kind: "layer-move"; id: string; last: Point }
  | { kind: "layer-transform"; id: string; handle: LayerHandle }
  | { kind: "draw-shape"; id: string; origin: Point; tool: ShapeTool }
  | { kind: "draw-path"; id: string; points: Point[] };


export interface PointerSample {
  /** Position in CSS pixels relative to the canvas. */
  point: Point;
  shiftKey?: boolean;
  /** Pointer button, following the DOM numbering (1 is the middle button). */
  button?: number;
}

export interface GestureContext {
  tool: ToolId;
  /** The crop rect, in stage space. */
  crop: Rect;
  layers: readonly EditorLayer[];
  /** The layer wearing the handles, if any. */
  selectedId?: string | null;
  /** stage space -> CSS pixels. */
  viewMatrix: Matrix;
  /** image space -> stage space. */
  stageFromImage: Matrix;
  imageLongestEdge: number;
  /** How a caption is measured, so a text layer's box fits its own letters. */
  measure: TextMeasurer;
  style: AnnotationStyle;
  minCropSize?: number;
  /** Injected so tests get stable layer ids. */
  createId: (prefix: string) => string;
}

export type GestureEffect =
  | { kind: "intent"; intent: Intent }
  | { kind: "view-pan"; delta: Point }
  | { kind: "select-tool"; tool: ToolId }
  | { kind: "focus-text"; layerId: string };

export interface GestureOutcome {
  state: GestureState;
  effects: GestureEffect[];
}
