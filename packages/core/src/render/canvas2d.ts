import { toArray } from "../geometry/matrix.js";
import type { Point } from "../geometry/types.js";
import type { Canvas2D } from "../image/canvas.js";
import type {
  EditorLayer,
  EllipseLayer,
  LineLayer,
  PathLayer,
  RectLayer,
  Stroke,
  TextLayer,
} from "../model/types.js";
import { applyAdjustmentsToImageData, hasAdjustments, supportsContextFilter } from "./adjustments.js";
import type { Scene, SceneLayerNode } from "./scene.js";

export interface RenderOptions {
  /** Clear the target before drawing. Off when compositing over something else. */
  clear?: boolean;
  /** Skip annotation layers — used by the crop preview. */
  skipLayers?: boolean;
  /** Adjustments as document values, needed by the pixel fallback path. */
  adjustments?: Scene["filter"] extends string ? undefined : never;
}

/**
 * Draws a scene with the Canvas2D API.
 *
 * V1 ships one renderer on purpose: a WebGL backend would double the surface
 * area before the coordinate model has been proven in real use. The scene is the
 * seam a second renderer would plug into later.
 */
export function renderScene(context: Canvas2D, scene: Scene, options: RenderOptions = {}): void {
  const { target } = scene;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  if (options.clear !== false) context.clearRect(0, 0, target.width, target.height);

  if (scene.background) {
    context.fillStyle = scene.background;
    context.fillRect(0, 0, target.width, target.height);
  }

  const useContextFilter = scene.filter !== "" && supportsContextFilter(context);
  if (useContextFilter) context.filter = scene.filter;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.setTransform(...toArray(scene.image.matrix));
  context.drawImage(scene.image.source, 0, 0, scene.image.size.width, scene.image.size.height);

  context.setTransform(1, 0, 0, 1, 0, 0);
  if (useContextFilter) context.filter = "none";

  if (!useContextFilter && scene.filter !== "") {
    applyPixelAdjustments(context, scene);
  }

  if (!options.skipLayers) {
    for (const node of scene.layers) drawLayerNode(context, node);
  }

  context.restore();
}

function applyPixelAdjustments(context: Canvas2D, scene: Scene): void {
  const adjustments = parseFilter(scene.filter);
  if (!hasAdjustments(adjustments)) return;
  try {
    const image = context.getImageData(0, 0, scene.target.width, scene.target.height);
    applyAdjustmentsToImageData(image.data, adjustments);
    context.putImageData(image, 0, 0);
  } catch {
    // A tainted canvas (cross-origin source without CORS) cannot be read back.
    // The image still renders; only the adjustment is lost.
  }
}

/** Recovers adjustment values from the scene's filter string for the fallback path. */
function parseFilter(filter: string): { brightness: number; contrast: number; saturation: number } {
  const read = (name: string): number => {
    const match = new RegExp(`${name}\\(([-0-9.]+)\\)`).exec(filter);
    return match?.[1] ? Number(match[1]) - 1 : 0;
  };
  return { brightness: read("brightness"), contrast: read("contrast"), saturation: read("saturate") };
}

function drawLayerNode(context: Canvas2D, node: SceneLayerNode): void {
  const { layer, matrix, scale } = node;
  context.save();
  context.globalAlpha = layer.opacity;
  context.setTransform(...toArray(matrix));

  switch (layer.type) {
    case "rect":
      drawRect(context, layer, scale);
      break;
    case "ellipse":
      drawEllipse(context, layer, scale);
      break;
    case "line":
      drawLine(context, layer, scale);
      break;
    case "path":
      drawPath(context, layer, scale);
      break;
    case "text":
      drawText(context, layer);
      break;
  }

  context.restore();
}

function applyStroke(context: Canvas2D, stroke: Stroke): void {
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash(stroke.dash ?? []);
}

/** Rotates around the shape's own centre, in image space. */
function withRotation(context: Canvas2D, layer: EditorLayer, centre: Point, draw: () => void): void {
  if (!layer.rotation) {
    draw();
    return;
  }
  context.save();
  context.translate(centre.x, centre.y);
  context.rotate(layer.rotation);
  context.translate(-centre.x, -centre.y);
  draw();
  context.restore();
}

function drawRect(context: Canvas2D, layer: RectLayer, _scale: number): void {
  const { frame } = layer;
  const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  withRotation(context, layer, centre, () => {
    context.beginPath();
    const radius = Math.min(layer.cornerRadius, frame.width / 2, frame.height / 2);
    if (radius > 0 && typeof context.roundRect === "function") {
      context.roundRect(frame.x, frame.y, frame.width, frame.height, radius);
    } else {
      context.rect(frame.x, frame.y, frame.width, frame.height);
    }
    if (layer.fill) {
      context.fillStyle = layer.fill;
      context.fill();
    }
    if (layer.stroke) {
      applyStroke(context, layer.stroke);
      context.stroke();
    }
  });
}

function drawEllipse(context: Canvas2D, layer: EllipseLayer, _scale: number): void {
  const { frame } = layer;
  const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  withRotation(context, layer, centre, () => {
    context.beginPath();
    context.ellipse(centre.x, centre.y, Math.abs(frame.width / 2), Math.abs(frame.height / 2), 0, 0, Math.PI * 2);
    if (layer.fill) {
      context.fillStyle = layer.fill;
      context.fill();
    }
    if (layer.stroke) {
      applyStroke(context, layer.stroke);
      context.stroke();
    }
  });
}

function drawLine(context: Canvas2D, layer: LineLayer, _scale: number): void {
  applyStroke(context, layer.stroke);
  const centre = { x: (layer.from.x + layer.to.x) / 2, y: (layer.from.y + layer.to.y) / 2 };
  withRotation(context, layer, centre, () => {
    const headLength = layer.stroke.width * 3.5;
    const angle = Math.atan2(layer.to.y - layer.from.y, layer.to.x - layer.from.x);
    const length = Math.hypot(layer.to.x - layer.from.x, layer.to.y - layer.from.y);

    // Pull the shaft back so it does not poke through the arrow head.
    const startInset = layer.arrowStart ? Math.min(headLength * 0.8, length / 2) : 0;
    const endInset = layer.arrowEnd ? Math.min(headLength * 0.8, length / 2) : 0;

    context.beginPath();
    context.moveTo(layer.from.x + Math.cos(angle) * startInset, layer.from.y + Math.sin(angle) * startInset);
    context.lineTo(layer.to.x - Math.cos(angle) * endInset, layer.to.y - Math.sin(angle) * endInset);
    context.stroke();

    context.fillStyle = layer.stroke.color;
    if (layer.arrowEnd) drawArrowHead(context, layer.to, angle, headLength);
    if (layer.arrowStart) drawArrowHead(context, layer.from, angle + Math.PI, headLength);
  });
}

function drawArrowHead(context: Canvas2D, tip: Point, angle: number, length: number): void {
  const spread = Math.PI / 7;
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(tip.x - Math.cos(angle - spread) * length, tip.y - Math.sin(angle - spread) * length);
  context.lineTo(tip.x - Math.cos(angle + spread) * length, tip.y - Math.sin(angle + spread) * length);
  context.closePath();
  context.fill();
}

function drawPath(context: Canvas2D, layer: PathLayer, _scale: number): void {
  const points = layer.points;
  if (points.length === 0) return;
  applyStroke(context, layer.stroke);

  const first = points[0]!;
  if (points.length === 1) {
    context.beginPath();
    context.arc(first.x, first.y, layer.stroke.width / 2, 0, Math.PI * 2);
    context.fillStyle = layer.stroke.color;
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(first.x, first.y);
  // Quadratic midpoint smoothing: cheap, stable, and free of the overshoot a
  // Catmull-Rom fit produces on fast strokes.
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
  }
  const last = points.at(-1)!;
  context.lineTo(last.x, last.y);
  if (layer.closed) context.closePath();
  context.stroke();
}

function drawText(context: Canvas2D, layer: TextLayer): void {
  context.font = `${layer.fontSize}px ${layer.fontFamily}`;
  context.textAlign = layer.align;
  context.textBaseline = "top";

  const lines = wrapText(context, layer);
  const lineHeight = layer.fontSize * 1.25;
  const width = Math.max(...lines.map((line) => context.measureText(line).width), 0);
  const height = lines.length * lineHeight;
  const originX =
    layer.align === "center" ? layer.position.x + width / 2 : layer.align === "right" ? layer.position.x + width : layer.position.x;
  const centre = { x: layer.position.x + width / 2, y: layer.position.y + height / 2 };

  withRotation(context, layer, centre, () => {
    if (layer.backgroundColor) {
      const padding = layer.fontSize * 0.2;
      context.fillStyle = layer.backgroundColor;
      context.fillRect(
        layer.position.x - padding,
        layer.position.y - padding,
        width + padding * 2,
        height + padding * 2,
      );
    }
    context.fillStyle = layer.color;
    lines.forEach((line, index) => {
      context.fillText(line, originX, layer.position.y + index * lineHeight);
    });
  });
}

/** Greedy word wrap; explicit newlines always break. */
export function wrapText(context: Canvas2D, layer: TextLayer): string[] {
  const paragraphs = layer.text.split("\n");
  if (layer.maxWidth == null) return paragraphs;

  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word;
      if (line && context.measureText(candidate).width > layer.maxWidth) {
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
