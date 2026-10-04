/**
 * What a pointer-down starts, which is a question about the *tool*.
 *
 * The other half of the machine — what a move or a release does — dispatches on
 * the gesture already running instead. Two different questions with two
 * different subjects, which is why they are two files: nothing here reads a
 * `GestureState`, and nothing next door reads a tool.
 */
import { createPathLayer, createTextLayer } from "@pixen/core";
import { fontSizeFor, strokeFor, TEXT_PLATE_COLOUR } from "../../tools/index.js";
import { screenToImage, screenToStage } from "./coordinates.js";
import { hitCropHandle, hitLayer, hitLayerHandle, isInsideCrop } from "./hit-testing.js";
import { shapeLayerFor, SHAPE_TOOLS } from "./shapes.js";
import { IDLE, intent } from "./effects.js";
import type { GestureContext, GestureOutcome, PointerSample, ShapeTool } from "./types.js";

/**
 * Pointer down. A middle button or a held shift pans the view whatever tool is
 * active — the one gesture that never edits the document — unless it grabbed a
 * resize handle first, which is what the comment below is about.
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
