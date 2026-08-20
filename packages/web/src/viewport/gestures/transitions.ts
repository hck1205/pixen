import {
  createPathLayer,
  createTextLayer,
  delta,
  distance,
  findLayer,
  last,
  layerBounds,
  ROTATION_SNAP,
  type EditorLayer,
  type Intent,
  type LayerHandle,
} from "@pixen/core";
import { cornerRadiusFor, fontSizeFor, strokeFor, TEXT_PLATE_COLOUR } from "../../tools/index.js";
import { MIN_LAYER_SIZE_RATIO, PATH_SAMPLE_RATIO } from "./constants.js";
import { screenToImage, screenToStage } from "./coordinates.js";
import { hitCropHandle, hitLayer, hitLayerHandle, isInsideCrop } from "./hit-testing.js";
import { constrainToAxis, frameFrom, isDegenerate, shapeLayerFor, SHAPE_TOOLS } from "./shapes.js";
import type {
  GestureContext,
  GestureEffect,
  GestureOutcome,
  GestureState,
  PointerSample,
  ShapeTool,
} from "./types.js";

/**
 * The state machine: pointer down, move, up, cancel.
 *
 * Each transition is a pure function from (state, sample, context) to (state,
 * effects). The element applies the effects; nothing here touches the DOM.
 */
export const IDLE: GestureState = { kind: "idle" };

const intent = (value: Intent): GestureEffect => ({ kind: "intent", intent: value });

/** A shift-drag locks the ratio the layer already has, rather than a square. */
function aspectRatioOf(layer: EditorLayer | null, handle: LayerHandle): number | null {
  if (!layer || handle === "rotate") return null;
  const bounds = layerBounds(layer);
  return bounds.height === 0 ? null : bounds.width / bounds.height;
}

/**
 * Pointer down. A middle button or a held shift always pans the view, whatever
 * tool is active — the one gesture that never edits the document.
 */
export function beginGesture(sample: PointerSample, context: GestureContext): GestureOutcome {
  // Grabbing a handle outranks the pan shortcut, so shift can mean "lock the
  // ratio" on the very drag that started it rather than being swallowed here.
  const grabbed = context.tool === "select" ? beginLayerTransform(sample, context) : null;
  if (grabbed) return grabbed;

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

/** A handle belongs to the layer already wearing it, whatever lies underneath. */
function beginLayerTransform(sample: PointerSample, context: GestureContext): GestureOutcome | null {
  const handle = hitLayerHandle(context, sample.point);
  if (!handle || !context.selectedId) return null;
  return {
    state: { kind: "layer-transform", id: context.selectedId, handle },
    effects: [
      intent({
        kind: "begin-transaction",
        label: handle === "rotate" ? "Rotate annotation" : "Resize annotation",
      }),
    ],
  };
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
    align: context.style.textAlign,
    backgroundColor: context.style.textPlate ? TEXT_PLATE_COLOUR : null,
  });
  // Text is created complete and then edited, so it needs no drag state; the
  // tool hands over to select so the new layer can be moved straight away.
  //
  // The transaction opens here and is closed by whoever owns the editor, so
  // creating a text layer and typing into it is a single undo step rather than
  // two — and so the editor never has to ask whether one is already open,
  // because transactions do not nest.
  return {
    state: IDLE,
    effects: [
      intent({ kind: "begin-transaction", label: "Text" }),
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
      const moved = delta(state.last, sample.point);
      return { state: { ...state, last: sample.point }, effects: [{ kind: "view-pan", delta: moved }] };
    }

    case "crop-move": {
      const moved = delta(screenToStage(context, state.last), screenToStage(context, sample.point));
      return {
        state: { ...state, last: sample.point },
        effects: [intent({ kind: "pan-crop", delta: moved })],
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
      const moved = delta(screenToImage(context, state.last), screenToImage(context, sample.point));
      return {
        state: { ...state, last: sample.point },
        effects: [intent({ kind: "move-layer", id: state.id, delta: moved })],
      };
    }

    case "layer-transform": {
      const layer = findLayer(context.layers, state.id);
      // Shift means "keep it honest" in both directions: a square corner drag,
      // and a rotation that lands on a multiple of 15 degrees.
      const modified = sample.shiftKey === true;
      const aspectRatio =
        modified && state.handle !== "rotate" ? aspectRatioOf(layer, state.handle) : null;
      return {
        state,
        effects: [
          intent({
            kind: "drag-layer-handle",
            id: state.id,
            handle: state.handle,
            pointer: screenToImage(context, sample.point),
            minSize: context.imageLongestEdge * MIN_LAYER_SIZE_RATIO,
            ...(aspectRatio === null ? {} : { aspectRatio }),
            ...(modified && state.handle === "rotate" ? { snap: ROTATION_SNAP } : {}),
          }),
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
      // A rectangle's rounding is a fraction of its own shorter side, so it has
      // to follow the drag rather than being fixed when the drag began.
      const patch =
        state.tool === "rect"
          ? { frame, cornerRadius: cornerRadiusFor(context.style, frame) }
          : { frame };
      return { state, effects: [intent({ kind: "update-layer", id: state.id, patch })] };
    }

    case "draw-path": {
      const point = screenToImage(context, sample.point);
      const previous = last(state.points)!;
      // Samples the smoothing would not notice are dropped, so a long stroke
      // stays a small document.
      if (distance(previous, point) < context.imageLongestEdge * PATH_SAMPLE_RATIO) {
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
      const layer = findLayer(context.layers, state.id);
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
