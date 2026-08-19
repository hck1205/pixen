import type { Point, Rect } from "../geometry/types.js";
import { createId } from "../util/id.js";
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_LAYER_LOCKED,
  DEFAULT_LAYER_OPACITY,
  DEFAULT_LAYER_ROTATION,
  DEFAULT_LAYER_VISIBLE,
  DEFAULT_STROKE,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_COLOUR,
} from "./defaults.js";
import type {
  EditorLayer,
  EllipseLayer,
  LineLayer,
  PathLayer,
  RectLayer,
  Stroke,
  TextLayer,
} from "./types.js";

const layerDefaults = {
  visible: DEFAULT_LAYER_VISIBLE,
  locked: DEFAULT_LAYER_LOCKED,
  opacity: DEFAULT_LAYER_OPACITY,
  rotation: DEFAULT_LAYER_ROTATION,
} as const;

export { DEFAULT_STROKE };

export function createRectLayer(frame: Rect, options: Partial<RectLayer> = {}): RectLayer {
  return {
    id: createId("rect"),
    type: "rect",
    ...layerDefaults,
    frame,
    stroke: { ...DEFAULT_STROKE },
    fill: null,
    cornerRadius: DEFAULT_CORNER_RADIUS,
    ...options,
  };
}

export function createEllipseLayer(frame: Rect, options: Partial<EllipseLayer> = {}): EllipseLayer {
  return {
    id: createId("ellipse"),
    type: "ellipse",
    ...layerDefaults,
    frame,
    stroke: { ...DEFAULT_STROKE },
    fill: null,
    ...options,
  };
}

export function createLineLayer(from: Point, to: Point, options: Partial<LineLayer> = {}): LineLayer {
  return {
    id: createId("line"),
    type: "line",
    ...layerDefaults,
    from,
    to,
    stroke: { ...DEFAULT_STROKE },
    arrowStart: false,
    arrowEnd: false,
    ...options,
  };
}

export function createArrowLayer(from: Point, to: Point, options: Partial<LineLayer> = {}): LineLayer {
  return createLineLayer(from, to, { arrowEnd: true, ...options });
}

export function createPathLayer(points: Point[], options: Partial<PathLayer> = {}): PathLayer {
  return {
    id: createId("path"),
    type: "path",
    ...layerDefaults,
    points,
    stroke: { ...DEFAULT_STROKE },
    closed: false,
    ...options,
  };
}

export function createTextLayer(position: Point, text: string, options: Partial<TextLayer> = {}): TextLayer {
  return {
    id: createId("text"),
    type: "text",
    ...layerDefaults,
    position,
    text,
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    color: DEFAULT_TEXT_COLOUR,
    align: DEFAULT_TEXT_ALIGN,
    backgroundColor: null,
    maxWidth: null,
    ...options,
  };
}

/** Image-space bounding box of a layer, ignoring its own rotation. */
export function layerBounds(layer: EditorLayer): Rect {
  switch (layer.type) {
    case "rect":
    case "ellipse":
      return layer.frame;
    case "line": {
      const x = Math.min(layer.from.x, layer.to.x);
      const y = Math.min(layer.from.y, layer.to.y);
      return {
        x,
        y,
        width: Math.abs(layer.to.x - layer.from.x),
        height: Math.abs(layer.to.y - layer.from.y),
      };
    }
    case "path": {
      if (layer.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      const xs = layer.points.map((p) => p.x);
      const ys = layer.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    case "text": {
      // Without a measuring context this is an estimate; the renderer refines it.
      const lines = layer.text.split("\n");
      const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
      return {
        x: layer.position.x,
        y: layer.position.y,
        width: layer.maxWidth ?? longest * layer.fontSize * 0.55,
        height: lines.length * layer.fontSize * 1.2,
      };
    }
  }
}

export function translateLayer(layer: EditorLayer, dx: number, dy: number): EditorLayer {
  switch (layer.type) {
    case "rect":
    case "ellipse":
      return { ...layer, frame: { ...layer.frame, x: layer.frame.x + dx, y: layer.frame.y + dy } };
    case "line":
      return {
        ...layer,
        from: { x: layer.from.x + dx, y: layer.from.y + dy },
        to: { x: layer.to.x + dx, y: layer.to.y + dy },
      };
    case "path":
      return { ...layer, points: layer.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "text":
      return { ...layer, position: { x: layer.position.x + dx, y: layer.position.y + dy } };
  }
}
