import { clampToPixels, transformBounds } from "../../geometry/rect.js";
import type { Matrix } from "../../geometry/types.js";
import { healRegion } from "../heal.js";
import { editPixels } from "./pixels.js";
import type { DrawOp } from "../ops/types.js";
import type { Canvas2D } from "../../image/canvas.js";

/**
 * Taking a spot out of the canvas, once it is on the canvas.
 *
 * The decision — what the spot becomes — is `healRegion`, over a plain buffer
 * and unit-tested in node. What is here is the part that needs a canvas: where
 * the spot landed after the transform, reading those pixels back, and writing
 * them again.
 *
 * A canvas the page may not read leaves the picture alone. That is the opposite
 * of the redaction's fallback, and deliberately: a redaction that cannot read
 * the canvas must still hide something, while a repair that cannot happen is a
 * blemish left visible — which is a disappointment rather than a disclosure.
 */
export function healSpot(context: Canvas2D, op: Extract<DrawOp, { op: "heal" }>, transform: Matrix): void {
  const { frame } = op;
  if (frame.width <= 0 || frame.height <= 0) return;

  const canvas = context.canvas;
  const region = clampToPixels(transformBounds(transform, frame), canvas.width, canvas.height);
  if (region.width < 1 || region.height < 1) return;

  // A canvas the page may not read returns false here, and there is nothing to
  // do about it but leave the picture as it is. See the note above.
  editPixels(context, region, (pixels, width, height) =>
    healRegion(pixels, width, height, { x: 0, y: 0, width, height }, op.feather),
  );
}
