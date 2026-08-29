import {
  createArrowLayer,
  distance,
  createEllipseLayer,
  createRectLayer,
  createRedactLayer,
  createRetouchLayer,
  isFramedLayer,
  type EditorLayer,
  type Point,
  type Rect,
} from "@pixen/core";
import { strokeFor } from "../../tools/index.js";
import { DEGENERATE_RATIO } from "./constants.js";
import type { GestureContext, ShapeTool } from "./types.js";

/**
 * Turning a drag into a shape: which layer a tool starts, how a drag becomes a
 * frame, and when the result is too small to be worth keeping.
 */
export function shapeLayerFor(tool: ShapeTool, origin: Point, context: GestureContext): EditorLayer {
  const stroke = strokeFor(context.style, context.imageLongestEdge);
  const frame: Rect = { x: origin.x, y: origin.y, width: 0, height: 0 };

  switch (tool) {
    case "rect":
      return createRectLayer(frame, {
        id: context.createId("rect"),
        stroke,
        fill: context.style.fill,
        // Zero until the drag gives the rectangle a size; `frameFrom` grows it,
        // and the radius follows in `moveGesture`.
        cornerRadius: 0,
      });
    case "redact":
      return createRedactLayer(frame, {
        id: context.createId("redact"),
        mode: context.style.redactionMode,
        strength: context.style.redactionStrength,
      });
    case "retouch":
      return createRetouchLayer(frame, { id: context.createId("retouch") });
    case "ellipse":
      return createEllipseLayer(frame, { id: context.createId("ellipse"), stroke, fill: context.style.fill });
    case "arrow":
      return createArrowLayer(origin, origin, {
        id: context.createId("line"),
        stroke,
        startStyle: context.style.startStyle,
        endStyle: context.style.endStyle,
      });
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
  if (isFramedLayer(layer)) return layer.frame.width < minimum && layer.frame.height < minimum;

  switch (layer.type) {
    case "line":
      return distance(layer.from, layer.to) < minimum;
    case "path":
      return layer.points.length < 2;
    default:
      return false;
  }
}

/** Which tools draw a shape by dragging, and what they draw. */
export const SHAPE_TOOLS: Readonly<Record<string, ShapeTool>> = {
  rect: "rect",
  ellipse: "ellipse",
  arrow: "arrow",
  redact: "redact",
  retouch: "retouch",
};
