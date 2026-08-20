import { boundsOf } from "../geometry/rect.js";
import type { Point, Rect } from "../geometry/types.js";
import { createId } from "../util/id.js";
import {
  DEFAULT_CORNER_RADIUS,
  DEFAULT_REDACTION_MODE,
  DEFAULT_REDACTION_STRENGTH,
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
import { REDACTION_COLOUR } from "./palette.js";
import { AVERAGE_GLYPH_RATIO, LINE_HEIGHT_RATIO } from "./text-metrics.js";
import type {
  EditorLayer,
  ImageLayer,
  RedactLayer,
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

/**
 * A bitmap placed on the image. The pixels stay in the resource manager; the
 * layer is a frame and an id, which is what keeps a document with ten stickers
 * as small as one with none.
 */
export function createImageLayer(resourceId: string, frame: Rect, options: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: createId("image"),
    type: "image",
    ...layerDefaults,
    resourceId,
    frame,
    repeat: false,
    ...options,
  };
}

/**
 * A region to hide. `solid` removes the pixels; `blur` and `pixelate` obscure
 * them, which is a weaker promise and is documented as such.
 */
export function createRedactLayer(frame: Rect, options: Partial<RedactLayer> = {}): RedactLayer {
  return {
    id: createId("redact"),
    type: "redact",
    ...layerDefaults,
    frame,
    mode: DEFAULT_REDACTION_MODE,
    strength: DEFAULT_REDACTION_STRENGTH,
    colour: REDACTION_COLOUR,
    ...options,
  };
}

/**
 * The layer with this id, or null.
 *
 * A one-line `find` repeated in six places is six places that could disagree
 * about what "missing" means; this one says null, everywhere.
 */
export function findLayer(layers: readonly EditorLayer[], id: string | null | undefined): EditorLayer | null {
  if (!id) return null;
  return layers.find((layer) => layer.id === id) ?? null;
}

/** Narrows in the same step, for callers that only want one kind of layer. */
export function findLayerOfType<T extends EditorLayer["type"]>(
  layers: readonly EditorLayer[],
  id: string | null | undefined,
  type: T,
): Extract<EditorLayer, { type: T }> | null {
  const layer = findLayer(layers, id);
  return layer?.type === type ? (layer as Extract<EditorLayer, { type: T }>) : null;
}

/** Image-space bounding box of a layer, ignoring its own rotation. */
export function layerBounds(layer: EditorLayer): Rect {
  switch (layer.type) {
    case "rect":
    case "ellipse":
    case "image":
    case "redact":
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
    case "path":
      return boundsOf(layer.points);
    case "text": {
      // Without a measuring context this is an estimate; the renderer refines it.
      const lines = layer.text.split("\n");
      const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
      return {
        x: layer.position.x,
        y: layer.position.y,
        width: layer.maxWidth ?? longest * layer.fontSize * AVERAGE_GLYPH_RATIO,
        height: lines.length * layer.fontSize * LINE_HEIGHT_RATIO,
      };
    }
  }
}

export function translateLayer(layer: EditorLayer, dx: number, dy: number): EditorLayer {
  switch (layer.type) {
    case "rect":
    case "ellipse":
    case "image":
    case "redact":
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
