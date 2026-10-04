import type { Canvas2D } from "../../image/canvas.js";
import type { DrawOp } from "../ops/types.js";

/**
 * A caption, drawn line by line.
 *
 * Where the lines break, how wide the box is and where the first one starts
 * were all settled in `model/text-layout.ts` against this same context's
 * measurements, so nothing here may re-decide any of them.
 */
export function drawText(context: Canvas2D, op: Extract<DrawOp, { op: "text" }>): void {
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
