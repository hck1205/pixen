import type { Canvas2D } from "../../image/canvas.js";
import type { DrawOp } from "../ops/types.js";

/**
 * The two bitmaps that are not the picture: a layer's own, and the backdrop.
 *
 * Both are placed by a rect the op already worked out, so what is here is the
 * drawing and one engine question — whether a pattern could be made.
 */

/** A bitmap layer: stretched into its frame, or tiled at its natural size. */
export function drawLayerImage(context: Canvas2D, op: Extract<DrawOp, { op: "layer-image" }>): void {
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

/** The bitmap under the picture, clipped to the region it fills. */
export function drawBackdrop(context: Canvas2D, op: Extract<DrawOp, { op: "backdrop" }>): void {
  context.save();
  context.beginPath();
  context.rect(op.clip.x, op.clip.y, op.clip.width, op.clip.height);
  context.clip();
  context.drawImage(op.source, op.rect.x, op.rect.y, op.rect.width, op.rect.height);
  context.restore();
}
