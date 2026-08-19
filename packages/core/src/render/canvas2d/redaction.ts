import { applyToPoint } from "../../geometry/matrix.js";
import type { Matrix, Rect } from "../../geometry/types.js";
import { createSurface, releaseSurface, type Canvas2D } from "../../image/canvas.js";
import { supportsContextFilter } from "../adjustments.js";
import type { DrawOp } from "../ops/index.js";

/**
 * Hiding what is already on the canvas.
 *
 * Unlike every other operation, these depend on what was drawn *before* them:
 * blur and pixelate read the pixels back. That is also why each of them can
 * fail — a tainted canvas cannot be read — and why every failure falls back to
 * the solid fill rather than to a hole. See docs/SECURITY.md for what each mode
 * does and does not promise.
 */
export function obscureRegion(context: Canvas2D, op: Extract<DrawOp, { op: "obscure" }>, transform: Matrix): void {
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
