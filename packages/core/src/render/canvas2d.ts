import { toArray } from "../geometry/matrix.js";
import type { Canvas2D } from "../image/canvas.js";
import { applyAdjustmentsToImageData, hasAdjustments, supportsContextFilter } from "./adjustments.js";
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
export function contextMeasurer(context: Canvas2D): TextMeasurer {
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

  for (const op of ops) {
    switch (op.op) {
      case "clear":
        context.clearRect(0, 0, op.width, op.height);
        break;
      case "fill-viewport":
        context.fillStyle = op.color;
        context.fillRect(0, 0, op.width, op.height);
        break;
      case "filter":
        context.filter = op.value;
        break;
      case "transform":
        context.setTransform(...toArray(op.matrix));
        break;
      case "alpha":
        context.globalAlpha = op.value;
        break;
      case "image":
        context.drawImage(op.source, 0, 0, op.width, op.height);
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
