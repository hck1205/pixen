import { last } from "../../fp/function.js";
import { compose, rotation, translation } from "../../geometry/matrix.js";
import { distance, midpoint } from "../../geometry/point.js";
import { boundsOf } from "../../geometry/rect.js";
import type { Matrix, Point, Rect } from "../../geometry/types.js";
import type {
  EditorLayer,
  EllipseLayer,
  ImageLayer,
  LineLayer,
  PathLayer,
  RectLayer,
  RedactLayer,
  Stroke,
  TextLayer,
} from "../../model/types.js";
import { seedFrom } from "../scramble.js";
import type { SceneLayerNode } from "../scene.js";
import { LINE_HEIGHT_RATIO } from "../../model/text-metrics.js";
import { fontFor, wrapLines } from "./text.js";
import type { DrawOp, PathCommand, StrokeStyle, TextMeasurer } from "./types.js";

/**
 * One layer at a time: what to draw for each kind, as data.
 *
 * Every decision a layer implies — where an arrow head sits, how a path is
 * smoothed, which centre a rotation turns about — is made here and handed to
 * the executor already resolved.
 */
function toStrokeStyle(stroke: Stroke): StrokeStyle {
  return { color: stroke.color, width: stroke.width, dash: stroke.dash ?? [] };
}

export function withLayerRotation(matrix: Matrix, rotationRadians: number, centre: Point): Matrix {
  if (!rotationRadians) return matrix;
  return compose(
    matrix,
    translation(centre.x, centre.y),
    rotation(rotationRadians),
    translation(-centre.x, -centre.y),
  );
}

function rectCentre(rect: Rect): Point {
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
  const length = distance(layer.from, layer.to);

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

/** Draws a bitmap into its frame, stretched or tiled. */
export function imageLayerOps(layer: ImageLayer, source: CanvasImageSource | undefined): DrawOp[] {
  if (!source) return [];
  return [{ op: "layer-image", source, frame: layer.frame, repeat: layer.repeat }];
}

/**
 * A redaction is one operation, whatever the mode: the executor decides how to
 * hide the region, and falls back to the solid fill when it cannot read the
 * canvas — a tainted canvas must not silently produce an unredacted export.
 */
export function redactLayerOps(layer: RedactLayer, imageLongestEdge: number): DrawOp[] {
  return [
    {
      op: "obscure",
      frame: layer.frame,
      mode: layer.mode,
      strength: Math.max(1, layer.strength * imageLongestEdge),
      colour: layer.colour,
      seed: seedFrom(layer.id),
    },
  ];
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
      return midpoint(layer.from, layer.to);
    case "path":
      return rectCentre(boundsOf(layer.points));
    case "image":
    case "redact":
      return rectCentre(layer.frame);
    case "text": {
      const font = fontFor(layer);
      const lines = wrapLines(layer.text, layer.maxWidth, font, measure);
      const width = lines.reduce((widest, line) => Math.max(widest, measure(line, font)), 0);
      const height = lines.length * layer.fontSize * LINE_HEIGHT_RATIO;
      return { x: layer.position.x + width / 2, y: layer.position.y + height / 2 };
    }
  }
}

export function layerOps(node: SceneLayerNode, measure: TextMeasurer, imageLongestEdge = 1): DrawOp[] {
  const { layer } = node;
  const matrix = withLayerRotation(node.matrix, layer.rotation, layerRotationCentre(layer, measure));
  const body = layerBodyOps(node, measure, imageLongestEdge);

  if (body.length === 0) return [];
  return [{ op: "alpha", value: layer.opacity }, { op: "transform", matrix }, ...body];
}

function layerBodyOps(node: SceneLayerNode, measure: TextMeasurer, imageLongestEdge: number): DrawOp[] {
  const { layer } = node;
  switch (layer.type) {
    case "rect":
      return rectLayerOps(layer);
    case "ellipse":
      return ellipseLayerOps(layer);
    case "line":
      return lineLayerOps(layer);
    case "path":
      return pathLayerOps(layer);
    case "text":
      return textLayerOps(layer, measure);
    case "image":
      return imageLayerOps(layer, node.resource);
    case "redact":
      return redactLayerOps(layer, imageLongestEdge);
  }
}
