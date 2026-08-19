import { applyToPoint, toArray } from "../geometry/matrix.js";
import { IDENTITY } from "../geometry/matrix.js";
import type { Matrix, Rect } from "../geometry/types.js";
import { createSurface, releaseSurface, type Canvas2D } from "../image/canvas.js";
import { hasAdjustments } from "../model/adjustments.js";
import { applyAdjustmentsToImageData, supportsContextFilter } from "./adjustments.js";
import { buildSceneOps, type BuildOptions, type DrawOp, type PathCommand, type TextMeasurer } from "./ops.js";
import type { Scene } from "./scene.js";

export interface RenderOptions {
  /** Clear the target before drawing. Off when compositing over something else. */
  clear?: boolean;
  /** Skip annotation layers — used by the crop preview. */
  skipLayers?: boolean;
  /** Overrides capability detection; mainly useful for tests and benchmarks. */
  contextFilter?: boolean;
}

/** Measures text with the real context, which is the only accurate source. */
function contextMeasurer(context: Canvas2D): TextMeasurer {
  return (text, font) => {
    context.font = font;
    return context.measureText(text).width;
  };
}

/**
 * Draws a scene with the Canvas2D API.
 *
 * Every decision was made in `ops.ts`; this function only executes. V1 ships one
 * renderer on purpose — a WebGL backend would double the surface area before the
 * coordinate model has been proven in real use, and the op list is the seam it
 * would plug into.
 */
export function renderScene(context: Canvas2D, scene: Scene, options: RenderOptions = {}): void {
  const buildOptions: BuildOptions = {
    measureText: contextMeasurer(context),
    contextFilter: options.contextFilter ?? supportsContextFilter(context),
    ...(options.clear === undefined ? {} : { clear: options.clear }),
    ...(options.skipLayers === undefined ? {} : { skipLayers: options.skipLayers }),
  };

  context.save();
  executeOps(context, buildSceneOps(scene, buildOptions));
  context.restore();
}

/** Applies an op list to a context. No branching beyond the op kind. */
export function executeOps(context: Canvas2D, ops: readonly DrawOp[]): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  // Region effects read pixels back, so they need the device-space rect — which
  // means tracking whatever transform the op list last set.
  let transform: Matrix = IDENTITY;

  for (const op of ops) {
    switch (op.op) {
      case "clear":
        context.clearRect(0, 0, op.width, op.height);
        break;
      case "fill-viewport":
        context.fillStyle = op.color;
        context.fillRect(0, 0, op.width, op.height);
        break;
      case "vignette":
        drawVignette(context, op);
        break;
      case "frame":
        drawFrame(context, op);
        break;
      case "filter":
        context.filter = op.value;
        break;
      case "transform":
        transform = op.matrix;
        context.setTransform(...toArray(op.matrix));
        break;
      case "alpha":
        context.globalAlpha = op.value;
        break;
      case "image":
        context.drawImage(op.source, 0, 0, op.width, op.height);
        break;
      case "layer-image":
        drawLayerImage(context, op);
        break;
      case "obscure":
        obscureRegion(context, op, transform);
        break;
      case "path":
        tracePath(context, op.commands);
        if (op.fill) {
          context.fillStyle = op.fill;
          context.fill();
        }
        if (op.stroke) {
          context.strokeStyle = op.stroke.color;
          context.lineWidth = op.stroke.width;
          context.lineCap = "round";
          context.lineJoin = "round";
          context.setLineDash(op.stroke.dash);
          context.stroke();
        }
        break;
      case "text":
        drawText(context, op);
        break;
      case "adjust-pixels":
        adjustPixels(context, op);
        break;
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
}

function tracePath(context: Canvas2D, commands: readonly PathCommand[]): void {
  context.beginPath();
  for (const command of commands) {
    switch (command.op) {
      case "move":
        context.moveTo(command.to.x, command.to.y);
        break;
      case "line":
        context.lineTo(command.to.x, command.to.y);
        break;
      case "quad":
        context.quadraticCurveTo(command.control.x, command.control.y, command.to.x, command.to.y);
        break;
      case "rect":
        context.rect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
        break;
      case "round-rect":
        if (typeof context.roundRect === "function") {
          context.roundRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height, command.radius);
        } else {
          context.rect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
        }
        break;
      case "ellipse":
        context.ellipse(command.centre.x, command.centre.y, command.radiusX, command.radiusY, 0, 0, Math.PI * 2);
        break;
      case "circle":
        context.arc(command.centre.x, command.centre.y, command.radius, 0, Math.PI * 2);
        break;
      case "close":
        context.closePath();
        break;
    }
  }
}

/** A bitmap layer: stretched into its frame, or tiled at its natural size. */
function drawLayerImage(context: Canvas2D, op: Extract<DrawOp, { op: "layer-image" }>): void {
  const { frame, source } = op;
  if (frame.width <= 0 || frame.height <= 0) return;

  if (!op.repeat) {
    context.drawImage(source, frame.x, frame.y, frame.width, frame.height);
    return;
  }

  const pattern = context.createPattern(source, "repeat");
  if (!pattern) {
    context.drawImage(source, frame.x, frame.y, frame.width, frame.height);
    return;
  }
  // The pattern is anchored at the origin, so the frame is translated under it.
  context.save();
  context.translate(frame.x, frame.y);
  context.fillStyle = pattern;
  context.fillRect(0, 0, frame.width, frame.height);
  context.restore();
}

/**
 * Hides a region of what has already been drawn.
 *
 * `solid` paints over it. `blur` and `pixelate` read the pixels back, which a
 * cross-origin source forbids and an engine without canvas filters cannot do —
 * both fall back to the solid fill, because a redaction that quietly does
 * nothing is the one outcome that must not happen.
 */
function obscureRegion(context: Canvas2D, op: Extract<DrawOp, { op: "obscure" }>, transform: Matrix): void {
  const { frame } = op;
  if (frame.width <= 0 || frame.height <= 0) return;

  const fillSolid = (): void => {
    context.fillStyle = op.colour;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);
  };

  if (op.mode === "solid") {
    fillSolid();
    return;
  }

  const device = deviceRect(frame, transform);
  const canvas = context.canvas;
  const clamped = clampRect(device, canvas.width, canvas.height);
  if (clamped.width < 1 || clamped.height < 1) return;

  try {
    const scale = Math.max(Math.abs(transform.a), Math.abs(transform.b));
    const applied =
      op.mode === "blur"
        ? blurRegion(context, clamped, op.strength * scale)
        : pixelateRegion(context, clamped, op.strength * scale);
    if (applied) return;
  } catch {
    // A tainted canvas cannot be read back; fall through to the solid fill.
  }

  fillSolid();
}

/** Device-space bounding box of an image-space rect under `transform`. */
function deviceRect(rect: Rect, transform: Matrix): Rect {
  const corners = [
    applyToPoint(transform, { x: rect.x, y: rect.y }),
    applyToPoint(transform, { x: rect.x + rect.width, y: rect.y }),
    applyToPoint(transform, { x: rect.x + rect.width, y: rect.y + rect.height }),
    applyToPoint(transform, { x: rect.x, y: rect.y + rect.height }),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  return {
    x,
    y,
    width: Math.min(Math.ceil(rect.x + rect.width), width) - x,
    height: Math.min(Math.ceil(rect.y + rect.height), height) - y,
  };
}

/** Blurs by sampling a margin around the region, so its edges do not darken. */
function blurRegion(context: Canvas2D, region: Rect, radius: number): boolean {
  if (!supportsContextFilter(context)) return false;
  const margin = Math.ceil(radius * 2);
  const source = clampRect(
    { x: region.x - margin, y: region.y - margin, width: region.width + margin * 2, height: region.height + margin * 2 },
    context.canvas.width,
    context.canvas.height,
  );

  const surface = createSurface(source.width, source.height);
  try {
    surface.context.filter = `blur(${radius}px)`;
    surface.context.drawImage(
      context.canvas as CanvasImageSource,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      source.width,
      source.height,
    );

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(
      surface.canvas as CanvasImageSource,
      region.x - source.x,
      region.y - source.y,
      region.width,
      region.height,
      region.x,
      region.y,
      region.width,
      region.height,
    );
    context.restore();
    return true;
  } finally {
    releaseSurface(surface);
  }
}

/** Averages each block down and draws it back with smoothing off. */
function pixelateRegion(context: Canvas2D, region: Rect, blockSize: number): boolean {
  const columns = Math.max(1, Math.round(region.width / Math.max(1, blockSize)));
  const rows = Math.max(1, Math.round(region.height / Math.max(1, blockSize)));

  const surface = createSurface(columns, rows);
  try {
    surface.context.imageSmoothingEnabled = true;
    surface.context.drawImage(
      context.canvas as CanvasImageSource,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      columns,
      rows,
    );

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(surface.canvas as CanvasImageSource, 0, 0, columns, rows, region.x, region.y, region.width, region.height);
    context.imageSmoothingEnabled = true;
    context.restore();
    return true;
  } finally {
    releaseSurface(surface);
  }
}

function drawText(context: Canvas2D, op: Extract<DrawOp, { op: "text" }>): void {
  if (op.background) {
    context.fillStyle = op.background.color;
    context.fillRect(op.background.rect.x, op.background.rect.y, op.background.rect.width, op.background.rect.height);
  }
  context.font = op.font;
  context.textAlign = op.align;
  context.textBaseline = "top";
  context.fillStyle = op.color;
  op.lines.forEach((line, index) => {
    context.fillText(line, op.origin.x, op.origin.y + index * op.lineHeight);
  });
}

/**
 * How far in from the corner the darkening starts, and how dark it gets at the
 * very edge at full strength.
 */
const VIGNETTE_INNER_STOP = 0.45;
const VIGNETTE_MAX_ALPHA = 0.85;

/**
 * A radial fall-off towards the corners.
 *
 * Drawn rather than filtered: CSS filters have nothing that shades by position,
 * and a gradient fill costs one paint instead of a pass over every pixel.
 */
function drawVignette(context: Canvas2D, op: Extract<DrawOp, { op: "vignette" }>): void {
  const { rect, strength } = op;
  if (strength <= 0 || rect.width <= 0 || rect.height <= 0) return;

  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  // The gradient is circular, so it is drawn on a squared-up canvas and scaled
  // back to the rect — otherwise a wide image gets an oval.
  const radius = Math.max(rect.width, rect.height) / 2;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.translate(centreX, centreY);
  context.scale(rect.width / (radius * 2), rect.height / (radius * 2));

  const gradient = context.createRadialGradient(0, 0, radius * VIGNETTE_INNER_STOP, 0, 0, radius * Math.SQRT2);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, `rgba(0, 0, 0, ${(strength * VIGNETTE_MAX_ALPHA).toFixed(3)})`);
  context.fillStyle = gradient;
  context.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
  context.restore();
}

/**
 * The three frame styles.
 *
 * `solid` and `rounded` sit on the very edge, so half the stroke would fall
 * outside the canvas — they are inset by half a line width to stay whole.
 * `inset` is a hairline standing off the edge, which is a different look rather
 * than a different thickness.
 */
function drawFrame(context: Canvas2D, op: Extract<DrawOp, { op: "frame" }>): void {
  const { rect, width, colour, style } = op;
  if (width <= 0 || rect.width <= 0 || rect.height <= 0) return;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.strokeStyle = colour;
  context.lineWidth = width;

  const offset = style === "inset" ? op.inset + width / 2 : width / 2;
  const box = {
    x: rect.x + offset,
    y: rect.y + offset,
    width: Math.max(0, rect.width - offset * 2),
    height: Math.max(0, rect.height - offset * 2),
  };

  if (box.width <= 0 || box.height <= 0) {
    context.restore();
    return;
  }

  context.beginPath();
  if (style === "rounded" && typeof context.roundRect === "function") {
    // The radius cannot exceed half the shorter side, or the corners overlap.
    const radius = Math.min(op.radius, box.width / 2, box.height / 2);
    context.roundRect(box.x, box.y, box.width, box.height, radius);
  } else {
    context.rect(box.x, box.y, box.width, box.height);
  }
  context.stroke();
  context.restore();
}

function adjustPixels(context: Canvas2D, op: Extract<DrawOp, { op: "adjust-pixels" }>): void {
  if (!hasAdjustments(op.adjustments)) return;
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    const image = context.getImageData(0, 0, op.width, op.height);
    applyAdjustmentsToImageData(image.data, op.adjustments);
    context.putImageData(image, 0, 0);
  } catch {
    // A tainted canvas (cross-origin source without CORS) cannot be read back.
    // The image still renders; only the adjustment is lost.
  }
}
