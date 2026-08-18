import { last } from "../fp/function.js";
import { compose, rotation, translation } from "../geometry/matrix.js";
import type { Matrix, Point, Rect } from "../geometry/types.js";
import type {
  Adjustments,
  EditorLayer,
  EllipseLayer,
  LineLayer,
  PathLayer,
  RectLayer,
  Stroke,
  TextLayer,
} from "../model/types.js";
import type { Scene, SceneLayerNode } from "./scene.js";

/**
 * Drawing, expressed as data.
 *
 * The renderer used to decide *and* draw in the same statement, which put every
 * decision — where an arrow head goes, how text wraps, whether a rotation is
 * applied around the right centre — behind a canvas context and out of reach of
 * a unit test. Building an op list first splits the two: this module is pure and
 * fully testable in node, and `canvas2d.ts` is a small executor with no
 * decisions left in it.
 */
export type PathCommand =
  | { op: "move"; to: Point }
  | { op: "line"; to: Point }
  | { op: "quad"; control: Point; to: Point }
  | { op: "rect"; rect: Rect }
  | { op: "round-rect"; rect: Rect; radius: number }
  | { op: "ellipse"; centre: Point; radiusX: number; radiusY: number }
  | { op: "circle"; centre: Point; radius: number }
  | { op: "close" };

export interface StrokeStyle {
  color: string;
  width: number;
  dash: number[];
}

export interface TextBackground {
  rect: Rect;
  color: string;
}

export type DrawOp =
  | { op: "clear"; width: number; height: number }
  | { op: "fill-viewport"; color: string; width: number; height: number }
  | { op: "filter"; value: string }
  | { op: "transform"; matrix: Matrix }
  | { op: "alpha"; value: number }
  | { op: "image"; source: CanvasImageSource; width: number; height: number }
  | { op: "path"; commands: PathCommand[]; stroke?: StrokeStyle; fill?: string }
  | {
      op: "text";
      lines: string[];
      origin: Point;
      lineHeight: number;
      font: string;
      align: "left" | "center" | "right";
      color: string;
      background?: TextBackground;
    }
  | { op: "adjust-pixels"; adjustments: Adjustments; width: number; height: number };

/** Measures a string in a given CSS font. Injected so text layout is testable. */
export type TextMeasurer = (text: string, font: string) => number;

export interface BuildOptions {
  /** False when the engine lacks canvas `filter`, which switches to the pixel path. */
  contextFilter?: boolean;
  measureText?: TextMeasurer;
  clear?: boolean;
  skipLayers?: boolean;
}

/** Rough fallback: enough for layout when no real measurer is available. */
export const estimateTextWidth: TextMeasurer = (text, font) => {
  const size = Number.parseFloat(font) || 16;
  return text.length * size * 0.55;
};

export function toStrokeStyle(stroke: Stroke): StrokeStyle {
  return { color: stroke.color, width: stroke.width, dash: stroke.dash ?? [] };
}

export function fontFor(layer: TextLayer): string {
  return `${layer.fontSize}px ${layer.fontFamily}`;
}

/** Rotation happens around the shape's own centre, in image space. */
export function withLayerRotation(matrix: Matrix, rotationRadians: number, centre: Point): Matrix {
  if (!rotationRadians) return matrix;
  return compose(
    matrix,
    translation(centre.x, centre.y),
    rotation(rotationRadians),
    translation(-centre.x, -centre.y),
  );
}

export function rectCentre(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

// --- layers ----------------------------------------------------------------

export function rectLayerOps(layer: RectLayer): DrawOp[] {
  const radius = Math.min(layer.cornerRadius, layer.frame.width / 2, layer.frame.height / 2);
  const commands: PathCommand[] =
    radius > 0
      ? [{ op: "round-rect", rect: layer.frame, radius }]
      : [{ op: "rect", rect: layer.frame }];

  return [
    {
      op: "path",
      commands,
      ...(layer.fill ? { fill: layer.fill } : {}),
      ...(layer.stroke ? { stroke: toStrokeStyle(layer.stroke) } : {}),
    },
  ];
}

export function ellipseLayerOps(layer: EllipseLayer): DrawOp[] {
  const centre = rectCentre(layer.frame);
  return [
    {
      op: "path",
      commands: [
        {
          op: "ellipse",
          centre,
          radiusX: Math.abs(layer.frame.width / 2),
          radiusY: Math.abs(layer.frame.height / 2),
        },
      ],
      ...(layer.fill ? { fill: layer.fill } : {}),
      ...(layer.stroke ? { stroke: toStrokeStyle(layer.stroke) } : {}),
    },
  ];
}

export const ARROW_HEAD_RATIO = 3.5;
const ARROW_SPREAD = Math.PI / 7;

/** The triangle for one arrow head, pointing along `angle`. */
export function arrowHeadCommands(tip: Point, angle: number, length: number): PathCommand[] {
  return [
    { op: "move", to: tip },
    {
      op: "line",
      to: { x: tip.x - Math.cos(angle - ARROW_SPREAD) * length, y: tip.y - Math.sin(angle - ARROW_SPREAD) * length },
    },
    {
      op: "line",
      to: { x: tip.x - Math.cos(angle + ARROW_SPREAD) * length, y: tip.y - Math.sin(angle + ARROW_SPREAD) * length },
    },
    { op: "close" },
  ];
}

export function lineLayerOps(layer: LineLayer): DrawOp[] {
  const headLength = layer.stroke.width * ARROW_HEAD_RATIO;
  const angle = Math.atan2(layer.to.y - layer.from.y, layer.to.x - layer.from.x);
  const length = Math.hypot(layer.to.x - layer.from.x, layer.to.y - layer.from.y);

  // The shaft is pulled back so it does not poke through an arrow head.
  const startInset = layer.arrowStart ? Math.min(headLength * 0.8, length / 2) : 0;
  const endInset = layer.arrowEnd ? Math.min(headLength * 0.8, length / 2) : 0;

  const ops: DrawOp[] = [
    {
      op: "path",
      commands: [
        { op: "move", to: { x: layer.from.x + Math.cos(angle) * startInset, y: layer.from.y + Math.sin(angle) * startInset } },
        { op: "line", to: { x: layer.to.x - Math.cos(angle) * endInset, y: layer.to.y - Math.sin(angle) * endInset } },
      ],
      stroke: toStrokeStyle(layer.stroke),
    },
  ];

  if (layer.arrowEnd) {
    ops.push({ op: "path", commands: arrowHeadCommands(layer.to, angle, headLength), fill: layer.stroke.color });
  }
  if (layer.arrowStart) {
    ops.push({
      op: "path",
      commands: arrowHeadCommands(layer.from, angle + Math.PI, headLength),
      fill: layer.stroke.color,
    });
  }
  return ops;
}

/**
 * Midpoint-smoothed path. Quadratic segments between sample midpoints stay
 * inside the samples, unlike a spline fit, which overshoots on fast strokes.
 */
export function pathLayerOps(layer: PathLayer): DrawOp[] {
  const points = layer.points;
  if (points.length === 0) return [];

  const first = points[0]!;
  if (points.length === 1) {
    return [
      {
        op: "path",
        commands: [{ op: "circle", centre: first, radius: layer.stroke.width / 2 }],
        fill: layer.stroke.color,
      },
    ];
  }

  const commands: PathCommand[] = [{ op: "move", to: first }];
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    commands.push({
      op: "quad",
      control: current,
      to: { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 },
    });
  }
  commands.push({ op: "line", to: last(points)! });
  if (layer.closed) commands.push({ op: "close" });

  return [{ op: "path", commands, stroke: toStrokeStyle(layer.stroke) }];
}

export const LINE_HEIGHT_RATIO = 1.25;

/** Greedy word wrap. Explicit newlines always break; `maxWidth` is optional. */
export function wrapLines(
  text: string,
  maxWidth: number | null,
  font: string,
  measure: TextMeasurer,
): string[] {
  const paragraphs = text.split("\n");
  if (maxWidth == null) return paragraphs;

  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word;
      if (line && measure(candidate, font) > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function textLayerOps(layer: TextLayer, measure: TextMeasurer): DrawOp[] {
  const font = fontFor(layer);
  const lines = wrapLines(layer.text, layer.maxWidth, font, measure);
  const lineHeight = layer.fontSize * LINE_HEIGHT_RATIO;
  const width = lines.reduce((widest, line) => Math.max(widest, measure(line, font)), 0);
  const height = lines.length * lineHeight;

  // Canvas aligns text about the anchor, so the anchor moves with the alignment
  // while the layer's own position stays the top-left of the block.
  const originX =
    layer.align === "center"
      ? layer.position.x + width / 2
      : layer.align === "right"
        ? layer.position.x + width
        : layer.position.x;

  const padding = layer.fontSize * 0.2;
  return [
    {
      op: "text",
      lines,
      origin: { x: originX, y: layer.position.y },
      lineHeight,
      font,
      align: layer.align,
      color: layer.color,
      ...(layer.backgroundColor
        ? {
            background: {
              color: layer.backgroundColor,
              rect: {
                x: layer.position.x - padding,
                y: layer.position.y - padding,
                width: width + padding * 2,
                height: height + padding * 2,
              },
            },
          }
        : {}),
    },
  ];
}

/** Image-space bounding box a layer's own rotation turns around. */
export function layerRotationCentre(layer: EditorLayer, measure: TextMeasurer): Point {
  switch (layer.type) {
    case "rect":
    case "ellipse":
      return rectCentre(layer.frame);
    case "line":
      return { x: (layer.from.x + layer.to.x) / 2, y: (layer.from.y + layer.to.y) / 2 };
    case "path": {
      const xs = layer.points.map((point) => point.x);
      const ys = layer.points.map((point) => point.y);
      if (xs.length === 0) return { x: 0, y: 0 };
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    case "text": {
      const font = fontFor(layer);
      const lines = wrapLines(layer.text, layer.maxWidth, font, measure);
      const width = lines.reduce((widest, line) => Math.max(widest, measure(line, font)), 0);
      const height = lines.length * layer.fontSize * LINE_HEIGHT_RATIO;
      return { x: layer.position.x + width / 2, y: layer.position.y + height / 2 };
    }
  }
}

export function layerOps(node: SceneLayerNode, measure: TextMeasurer): DrawOp[] {
  const { layer } = node;
  const matrix = withLayerRotation(node.matrix, layer.rotation, layerRotationCentre(layer, measure));

  const body =
    layer.type === "rect"
      ? rectLayerOps(layer)
      : layer.type === "ellipse"
        ? ellipseLayerOps(layer)
        : layer.type === "line"
          ? lineLayerOps(layer)
          : layer.type === "path"
            ? pathLayerOps(layer)
            : textLayerOps(layer, measure);

  if (body.length === 0) return [];
  return [{ op: "alpha", value: layer.opacity }, { op: "transform", matrix }, ...body];
}

// --- scene -----------------------------------------------------------------

/** Recovers adjustment values from a scene's filter string for the pixel path. */
export function adjustmentsFromFilter(filter: string): Adjustments {
  const read = (name: string): number => {
    const match = new RegExp(`${name}\\(([-0-9.]+)\\)`).exec(filter);
    return match?.[1] ? Number(match[1]) - 1 : 0;
  };
  return { brightness: read("brightness"), contrast: read("contrast"), saturation: read("saturate") };
}

/**
 * The whole frame as a list of operations, in draw order.
 *
 * Colour adjustment takes the canvas `filter` when the engine has one and the
 * pixel path when it does not, so a preview and an export cannot disagree
 * because of a browser capability.
 */
export function buildSceneOps(scene: Scene, options: BuildOptions = {}): DrawOp[] {
  const measure = options.measureText ?? estimateTextWidth;
  const useFilter = scene.filter !== "" && options.contextFilter !== false;
  const ops: DrawOp[] = [];

  if (options.clear !== false) {
    ops.push({ op: "clear", width: scene.target.width, height: scene.target.height });
  }
  if (scene.background) {
    ops.push({
      op: "fill-viewport",
      color: scene.background,
      width: scene.target.width,
      height: scene.target.height,
    });
  }

  if (useFilter) ops.push({ op: "filter", value: scene.filter });
  ops.push(
    { op: "alpha", value: 1 },
    { op: "transform", matrix: scene.image.matrix },
    { op: "image", source: scene.image.source, width: scene.image.size.width, height: scene.image.size.height },
  );
  if (useFilter) ops.push({ op: "filter", value: "none" });

  if (!useFilter && scene.filter !== "") {
    ops.push({
      op: "adjust-pixels",
      adjustments: adjustmentsFromFilter(scene.filter),
      width: scene.target.width,
      height: scene.target.height,
    });
  }

  if (options.skipLayers !== true) {
    for (const node of scene.layers) ops.push(...layerOps(node, measure));
  }

  return ops;
}
