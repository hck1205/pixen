import {
  delta,
  distance,
  findLayer,
  last,
  layerBounds,
  ROTATION_SNAP,
  type EditorLayer,
  type LayerHandle,
} from "@pixen/core";
import { cornerRadiusFor } from "../../tools/index.js";
import { MIN_LAYER_SIZE_RATIO, PATH_SAMPLE_RATIO } from "./tuning.js";
import { screenToImage, screenToStage } from "./coordinates.js";
import { constrainToAxis, frameFrom, isDegenerate } from "./shapes.js";
import { IDLE, intent } from "./effects.js";
import type { GestureContext, GestureOutcome, GestureState, PointerSample } from "./types.js";

/** A shift-drag locks the ratio the layer already has, rather than a square. */
function aspectRatioOf(layer: EditorLayer | null, handle: LayerHandle): number | null {
  if (!layer || handle === "rotate") return null;
  const bounds = layerBounds(layer);
  return bounds.height === 0 ? null : bounds.width / bounds.height;
}

/**
 * What a gesture already running does when the pointer moves or lets go.
 *
 * Dispatches on the state; `begin.ts` dispatches on the tool. Each transition
 * is a pure function from (state, sample, context) to (state, effects), and the
 * element applies the effects — nothing here touches the DOM.
 */

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
            // Built exactly rather than with undefined keys: an intent is data,
            // and data that carries "this field is not here" is noise in a log
            // and a surprise in a comparison. Inside the engine, where options
            // are read with `??` a line later, the guard is dropped instead.
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
