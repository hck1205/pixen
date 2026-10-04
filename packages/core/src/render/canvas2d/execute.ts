import { IDENTITY, toArray } from "../../geometry/matrix.js";
import type { Matrix } from "../../geometry/types.js";
import type { Canvas2D } from "../../image/canvas.js";
import { supportsContextFilter } from "../filter-support.js";
import type { TextMeasurer } from "../../model/text-layout.js";
import { buildSceneOps, type BuildOptions, type DrawOp } from "../ops/index.js";
import type { Scene } from "../scene.js";
import { drawVignette } from "./decoration.js";
import { drawBackdrop, drawLayerImage } from "./images.js";
import { drawPath } from "./paths.js";
import { adjustPixels, transformColours } from "./pixels.js";
import { obscureRegion } from "./redaction.js";
import { healSpot } from "./retouch.js";
import { drawText } from "./text.js";

/**
 * The executor: one line per kind of operation, and nothing else.
 *
 * Every judgement about *what* to draw was made while the operation list was
 * built, so when something looks wrong on screen the answer is in `ops/`, not
 * here — which is the point of the split.
 *
 * Three fallbacks are the exception, because only the moment of drawing can
 * discover them: whether the context has `roundRect` (`paths`), whether a
 * pattern could be made (`images`), and whether a tainted canvas can be read
 * back (`pixels`). Each sits beside the drawing it qualifies, so this file can
 * say it decides nothing and mean it. It used to say so while owning all three,
 * which sent a reader chasing a rounded rectangle that renders square into the
 * wrong file.
 */
export interface RenderOptions {
  /** Clear the target before drawing. Off when compositing over something else. */
  clear?: boolean;
  /** Skip annotation layers — used by the crop preview. */
  skipLayers?: boolean;
  /** Overrides capability detection; mainly useful for tests and benchmarks. */
  contextFilter?: boolean;
}

/**
 * Measures text with the real context, which is the only accurate source.
 *
 * Exported because the editor needs the same answer the renderer gets: a
 * selection box drawn from an estimate does not fit the letters it is around.
 */
export function contextMeasurer(context: Canvas2D): TextMeasurer {
  return (text, font) => {
    context.font = font;
    return context.measureText(text).width;
  };
}

/**
 * Draws a scene with the Canvas2D API.
 *
 * Every decision was made in `ops/`; this function only executes. V1 ships one
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
      case "fill-under":
        context.fillStyle = op.color;
        context.fillRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
        break;
      case "vignette":
        drawVignette(context, op);
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
      case "heal":
        healSpot(context, op, transform);
        break;
      case "backdrop":
        drawBackdrop(context, op);
        break;
      case "layer-image":
        drawLayerImage(context, op);
        break;
      case "obscure":
        obscureRegion(context, op, transform);
        break;
      case "path":
        drawPath(context, op);
        break;
      case "text":
        drawText(context, op);
        break;
      case "adjust-pixels":
        adjustPixels(context, op);
        break;
      case "colour-matrix":
        transformColours(context, op);
        break;
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
}
