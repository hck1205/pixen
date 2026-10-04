import { createSurface, releaseSurface, type Canvas2D } from "../canvas.js";
import type { Size } from "../../geometry/types.js";
import { stepDownPasses } from "./plan.js";

/**
 * Drawing at a size that `plan` worked out.
 *
 * The whole of the effect: allocate, halve, draw, release. How far to shrink
 * and in how many passes is decided next door.
 */
function configureSmoothing(context: Canvas2D): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
}

/**
 * Draws `source` into `context` at `target` size, halving in steps first.
 *
 * A single large downscale keeps only one sample per output pixel on several
 * browsers, which turns fine detail into aliasing; halving first averages the
 * pixels that would otherwise be skipped.
 */
export function drawResized(
  context: Canvas2D,
  source: CanvasImageSource,
  sourceSize: Size,
  target: Size,
  destination: { x: number; y: number } = { x: 0, y: 0 },
): void {
  configureSmoothing(context);
  const passes = stepDownPasses(sourceSize, target);

  if (passes === 0) {
    context.drawImage(source, destination.x, destination.y, target.width, target.height);
    return;
  }

  let current = createSurface(Math.ceil(sourceSize.width / 2), Math.ceil(sourceSize.height / 2));
  configureSmoothing(current.context);
  current.context.drawImage(source, 0, 0, current.canvas.width, current.canvas.height);

  for (let pass = 1; pass < passes; pass += 1) {
    const next = createSurface(Math.ceil(current.canvas.width / 2), Math.ceil(current.canvas.height / 2));
    configureSmoothing(next.context);
    next.context.drawImage(current.canvas, 0, 0, next.canvas.width, next.canvas.height);
    releaseSurface(current);
    current = next;
  }

  context.drawImage(current.canvas, destination.x, destination.y, target.width, target.height);
  releaseSurface(current);
}
