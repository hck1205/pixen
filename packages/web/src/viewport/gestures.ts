import {
  applyToPoint,
  createArrowLayer,
  createEllipseLayer,
  createPathLayer,
  createRectLayer,
  createTextLayer,
  CROP_HANDLES,
  invert,
  last,
  layerBounds,
  REDACTION_COLOUR,
  type CropHandle,
  type EditorLayer,
  type Intent,
  type Matrix,
  type Point,
  type Rect,
} from "@pixen/core";
import { fontSizeFor, strokeFor, type AnnotationStyle, type ToolId } from "../tools/index.js";

/**
 * Pointer gestures as a pure state machine.
 *
 * What a drag *means* — which handle it grabbed, whether the shape it drew is
 * big enough to keep, when a transaction opens and closes — used to live inside
 * DOM event handlers, reachable only from a browser test. Here it is a function
 * from (state, pointer sample, context) to (state, effects), so every path is
 * covered by an ordinary unit test, and the viewport is left holding nothing but
 * event plumbing.
 */
export type ShapeTool = "rect" | "ellipse" | "arrow" | "redact";

export type GestureState =
  | { kind: "idle" }
  | { kind: "view-pan"; last: Point }
  | { kind: "crop-move"; last: Point }
  | { kind: "crop-resize"; handle: CropHandle }
  | { kind: "layer-move"; id: string; last: Point }
  | { kind: "draw-shape"; id: string; origin: Point; tool: ShapeTool }
  | { kind: "draw-path"; id: string; points: Point[] };

export const IDLE: GestureState = { kind: "idle" };

export interface PointerSample {
  /** Position in CSS pixels relative to the canvas. */
  point: Point;
  shiftKey?: boolean;
  /** Pointer button, following the DOM numbering (1 is the middle button). */
  button?: number;
}

export interface GestureContext {
  tool: ToolId;
  /** Crop rect and stage bounds, both in stage space. */
  crop: Rect;
  stage: Rect;
  layers: readonly EditorLayer[];
  /** stage space -> CSS pixels. */
  viewMatrix: Matrix;
  /** image space -> stage space. */
  stageFromImage: Matrix;
  imageLongestEdge: number;
  style: AnnotationStyle;
  minCropSize?: number;
  /** Injected so tests get stable layer ids. */
  createId: (prefix: string) => string;
}

export type GestureEffect =
  | { kind: "intent"; intent: Intent }
  | { kind: "view-pan"; delta: Point }
  | { kind: "view-zoom"; factor: number; anchor: Point }
  | { kind: "select-tool"; tool: ToolId }
  | { kind: "focus-text"; layerId: string };

export interface GestureOutcome {
  state: GestureState;
  effects: GestureEffect[];
}

/** Screen distance, in CSS pixels, within which a crop handle is grabbed. */
export const HANDLE_HIT_RADIUS = 14;
/** A shape smaller than this fraction of the image is treated as a stray tap. */
export const DEGENERATE_RATIO = 0.004;
/** Free-draw samples closer than this fraction of the image are dropped. */
export const PATH_SAMPLE_RATIO = 0.002;

const intent = (value: Intent): GestureEffect => ({ kind: "intent", intent: value });

// --- coordinate helpers ----------------------------------------------------

export function screenToStage(context: GestureContext, point: Point): Point {
  return applyToPoint(invert(context.viewMatrix), point);
}

export function stageToScreen(context: GestureContext, point: Point): Point {
  return applyToPoint(context.viewMatrix, point);
}

export function screenToImage(context: GestureContext, point: Point): Point {
  return applyToPoint(invert(context.stageFromImage), screenToStage(context, point));
}

// --- hit testing -----------------------------------------------------------

export function cropHandlePosition(crop: Rect, handle: CropHandle): Point {
  const x = handle.includes("left") ? 0 : handle.includes("right") ? 1 : 0.5;
  const y = handle.startsWith("top") ? 0 : handle.startsWith("bottom") ? 1 : 0.5;
  return { x: crop.x + crop.width * x, y: crop.y + crop.height * y };
}

/** The nearest crop handle within the hit radius, in screen space. */
export function hitCropHandle(context: GestureContext, point: Point): CropHandle | null {
  let best: { handle: CropHandle; distance: number } | null = null;
  for (const handle of CROP_HANDLES) {
    const screen = stageToScreen(context, cropHandlePosition(context.crop, handle));
    const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
    if (distance <= HANDLE_HIT_RADIUS && (!best || distance < best.distance)) {
      best = { handle, distance };
    }
  }
  return best?.handle ?? null;
}

export function isInsideCrop(crop: Rect, stagePoint: Point): boolean {
  return (
    stagePoint.x >= crop.x &&
    stagePoint.x <= crop.x + crop.width &&
    stagePoint.y >= crop.y &&
    stagePoint.y <= crop.y + crop.height
  );
}

/** Topmost selectable layer whose padded bounding box contains the point. */
export function hitLayer(context: GestureContext, imagePoint: Point): EditorLayer | null {
  const tolerance = context.imageLongestEdge * 0.01;
  for (let i = context.layers.length - 1; i >= 0; i -= 1) {
    const layer = context.layers[i]!;
    if (!layer.visible || layer.locked) continue;
    const bounds = layerBounds(layer);
    if (
      imagePoint.x >= bounds.x - tolerance &&
      imagePoint.x <= bounds.x + bounds.width + tolerance &&
      imagePoint.y >= bounds.y - tolerance &&
      imagePoint.y <= bounds.y + bounds.height + tolerance
    ) {
      return layer;
    }
  }
  return null;
}

export function cursorForHandle(handle: CropHandle): string {
  switch (handle) {
    case "top":
    case "bottom":
      return "ns-resize";
    case "left":
    case "right":
      return "ew-resize";
    case "top-left":
    case "bottom-right":
      return "nwse-resize";
    default:
      return "nesw-resize";
  }
}

/** The cursor for a hover at `point`, given the active tool. */
export function cursorFor(context: GestureContext, point: Point): string {
  if (context.tool === "crop") {
    const handle = hitCropHandle(context, point);
    return handle ? cursorForHandle(handle) : "grab";
  }
  if (context.tool === "select") {
    return hitLayer(context, screenToImage(context, point)) ? "move" : "default";
  }
  return "crosshair";
}

// --- shape construction ----------------------------------------------------

function shapeLayerFor(tool: ShapeTool, origin: Point, context: GestureContext): EditorLayer {
  const stroke = strokeFor(context.style, context.imageLongestEdge);
  const frame: Rect = { x: origin.x, y: origin.y, width: 0, height: 0 };

  switch (tool) {
    case "rect":
      return createRectLayer(frame, { id: context.createId("rect"), stroke, fill: null });
    case "redact":
      return createRectLayer(frame, { id: context.createId("rect"), stroke: null, fill: REDACTION_COLOUR });
    case "ellipse":
      return createEllipseLayer(frame, { id: context.createId("ellipse"), stroke, fill: null });
    case "arrow":
      return createArrowLayer(origin, origin, { id: context.createId("line"), stroke });
  }
}

/** Squares a rectangle or snaps a line to the nearest axis, for shift-drags. */
export function constrainToAxis(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return Math.abs(dx) > Math.abs(dy) ? { x: point.x, y: origin.y } : { x: origin.x, y: point.y };
}

export function frameFrom(origin: Point, point: Point, square: boolean): Rect {
  let width = point.x - origin.x;
  let height = point.y - origin.y;
  if (square) {
    const size = Math.max(Math.abs(width), Math.abs(height));
    width = Math.sign(width) * size;
    height = Math.sign(height) * size;
  }
  return {
    x: width < 0 ? origin.x + width : origin.x,
    y: height < 0 ? origin.y + height : origin.y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/** True for the zero-sized layer a tap with a shape tool leaves behind. */
export function isDegenerate(layer: EditorLayer, imageLongestEdge: number): boolean {
  const minimum = imageLongestEdge * DEGENERATE_RATIO;
  switch (layer.type) {
    case "rect":
    case "ellipse":
      return layer.frame.width < minimum && layer.frame.height < minimum;
    case "line":
      return Math.hypot(layer.to.x - layer.from.x, layer.to.y - layer.from.y) < minimum;
    case "path":
      return layer.points.length < 2;
    default:
      return false;
  }
}

const SHAPE_TOOLS: Record<string, ShapeTool> = {
  rect: "rect",
  ellipse: "ellipse",
  arrow: "arrow",
  redact: "redact",
};

// --- transitions -----------------------------------------------------------

/**
 * Pointer down. A middle button or a held shift always pans the view, whatever
 * tool is active — the one gesture that never edits the document.
 */
export function beginGesture(sample: PointerSample, context: GestureContext): GestureOutcome {
  if (sample.button === 1 || sample.shiftKey === true) {
    return { state: { kind: "view-pan", last: sample.point }, effects: [] };
  }

  if (context.tool === "crop") return beginCrop(sample, context);
  if (context.tool === "select") return beginSelect(sample, context);
  if (context.tool === "text") return beginText(sample, context);
  if (context.tool === "draw") return beginPath(sample, context);

  const shape = SHAPE_TOOLS[context.tool];
  if (shape) return beginShape(shape, sample, context);
  return { state: IDLE, effects: [] };
}

function beginCrop(sample: PointerSample, context: GestureContext): GestureOutcome {
  const handle = hitCropHandle(context, sample.point);
  if (handle) {
    return {
      state: { kind: "crop-resize", handle },
      effects: [intent({ kind: "begin-transaction", label: "Crop" })],
    };
  }
  if (isInsideCrop(context.crop, screenToStage(context, sample.point))) {
    return {
      state: { kind: "crop-move", last: sample.point },
      effects: [intent({ kind: "begin-transaction", label: "Move crop" })],
    };
  }
  return { state: { kind: "view-pan", last: sample.point }, effects: [] };
}

function beginSelect(sample: PointerSample, context: GestureContext): GestureOutcome {
  const hit = hitLayer(context, screenToImage(context, sample.point));
  const select = intent({ kind: "select", id: hit?.id ?? null });
  if (!hit) return { state: { kind: "view-pan", last: sample.point }, effects: [select] };

  return {
    state: { kind: "layer-move", id: hit.id, last: sample.point },
    effects: [select, intent({ kind: "begin-transaction", label: "Move annotation" })],
  };
}

function beginText(sample: PointerSample, context: GestureContext): GestureOutcome {
  const origin = screenToImage(context, sample.point);
  const layer = createTextLayer(origin, "", {
    id: context.createId("text"),
    color: context.style.colour,
    fontSize: fontSizeFor(context.style, context.imageLongestEdge),
  });
  // Text is created complete and then edited, so it needs no drag state; the
  // tool hands over to select so the new layer can be moved straight away.
  return {
    state: IDLE,
    effects: [
      intent({ kind: "add-layer", layer }),
      { kind: "select-tool", tool: "select" },
      { kind: "focus-text", layerId: layer.id },
    ],
  };
}

function beginShape(tool: ShapeTool, sample: PointerSample, context: GestureContext): GestureOutcome {
  const origin = screenToImage(context, sample.point);
  const layer = shapeLayerFor(tool, origin, context);
  return {
    state: { kind: "draw-shape", id: layer.id, origin, tool },
    effects: [
      intent({ kind: "begin-transaction", label: "Annotate" }),
      intent({ kind: "add-layer", layer }),
    ],
  };
}

function beginPath(sample: PointerSample, context: GestureContext): GestureOutcome {
  const origin = screenToImage(context, sample.point);
  const layer = createPathLayer([origin], {
    id: context.createId("path"),
    stroke: strokeFor(context.style, context.imageLongestEdge),
  });
  return {
    state: { kind: "draw-path", id: layer.id, points: [origin] },
    effects: [
      intent({ kind: "begin-transaction", label: "Annotate" }),
      intent({ kind: "add-layer", layer }),
    ],
  };
}

/** Pointer move. Idle moves produce no effects; the viewport handles hover itself. */
export function moveGesture(
  state: GestureState,
  sample: PointerSample,
  context: GestureContext,
): GestureOutcome {
  switch (state.kind) {
    case "idle":
      return { state, effects: [] };

    case "view-pan": {
      const delta = { x: sample.point.x - state.last.x, y: sample.point.y - state.last.y };
      return { state: { ...state, last: sample.point }, effects: [{ kind: "view-pan", delta }] };
    }

    case "crop-move": {
      const from = screenToStage(context, state.last);
      const to = screenToStage(context, sample.point);
      return {
        state: { ...state, last: sample.point },
        effects: [intent({ kind: "pan-crop", delta: { x: to.x - from.x, y: to.y - from.y } })],
      };
    }

    case "crop-resize":
      return {
        state,
        effects: [
          intent({
            kind: "drag-crop-handle",
            handle: state.handle,
            pointer: screenToStage(context, sample.point),
            ...(context.minCropSize === undefined ? {} : { minSize: context.minCropSize }),
          }),
        ],
      };

    case "layer-move": {
      const from = screenToImage(context, state.last);
      const to = screenToImage(context, sample.point);
      return {
        state: { ...state, last: sample.point },
        effects: [
          intent({ kind: "move-layer", id: state.id, delta: { x: to.x - from.x, y: to.y - from.y } }),
        ],
      };
    }

    case "draw-shape": {
      const point = screenToImage(context, sample.point);
      const square = sample.shiftKey === true;
      if (state.tool === "arrow") {
        const to = square ? constrainToAxis(state.origin, point) : point;
        return { state, effects: [intent({ kind: "update-layer", id: state.id, patch: { to } })] };
      }
      const frame = frameFrom(state.origin, point, square);
      return { state, effects: [intent({ kind: "update-layer", id: state.id, patch: { frame } })] };
    }

    case "draw-path": {
      const point = screenToImage(context, sample.point);
      const previous = last(state.points)!;
      // Samples the smoothing would not notice are dropped, so a long stroke
      // stays a small document.
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < context.imageLongestEdge * PATH_SAMPLE_RATIO) {
        return { state, effects: [] };
      }
      const points = [...state.points, point];
      return {
        state: { ...state, points },
        effects: [intent({ kind: "update-layer", id: state.id, patch: { points } })],
      };
    }
  }
}

/**
 * Pointer up. A drawing gesture that produced nothing worth keeping is rolled
 * back rather than committed, so a stray tap costs neither a layer nor an undo
 * step.
 */
export function endGesture(state: GestureState, context: GestureContext): GestureOutcome {
  switch (state.kind) {
    case "idle":
    case "view-pan":
      return { state: IDLE, effects: [] };

    case "draw-shape":
    case "draw-path": {
      const layer = context.layers.find((candidate) => candidate.id === state.id);
      if (!layer || isDegenerate(layer, context.imageLongestEdge)) {
        return { state: IDLE, effects: [intent({ kind: "rollback-transaction" })] };
      }
      return { state: IDLE, effects: [intent({ kind: "commit-transaction" })] };
    }

    default:
      return { state: IDLE, effects: [intent({ kind: "commit-transaction" })] };
  }
}

/** Pointer cancel, or a second finger arriving: abandon whatever was in progress. */
export function cancelGesture(state: GestureState): GestureOutcome {
  if (state.kind === "idle" || state.kind === "view-pan") return { state: IDLE, effects: [] };
  return { state: IDLE, effects: [intent({ kind: "rollback-transaction" })] };
}

// --- pinch -----------------------------------------------------------------

export interface PinchState {
  distance: number;
  centre: Point;
}

export function pinchFrom(a: Point, b: Point): PinchState {
  return { distance: Math.hypot(b.x - a.x, b.y - a.y), centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** Zoom factor and pan delta for one pinch step. */
export function pinchStep(previous: PinchState, current: PinchState): { factor: number; delta: Point } {
  return {
    factor: previous.distance > 0 ? current.distance / previous.distance : 1,
    delta: { x: current.centre.x - previous.centre.x, y: current.centre.y - previous.centre.y },
  };
}

/** Wheel and trackpad zoom. Trackpad pinch arrives as ctrl + wheel. */
export function wheelZoomFactor(deltaY: number, ctrlKey: boolean): number {
  const intensity = ctrlKey ? 0.01 : 0.0022;
  return Math.exp(-deltaY * intensity);
}
