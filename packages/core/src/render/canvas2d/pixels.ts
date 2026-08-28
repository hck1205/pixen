import type { Rect } from "../../geometry/types.js";
import type { Canvas2D } from "../../image/canvas.js";
import { applyAdjustmentsToImageData } from "../adjustments.js";
import { applyColourMatrix } from "../colour-matrix.js";
import type { DrawOp } from "../ops/types.js";

/**
 * The operations that read the canvas back, change it, and write it again.
 *
 * Three of them do this — the pixel adjustment fallback, the host's colour
 * matrix, and the retouch brush — and each has the same two ways to go wrong:
 * writing a megapixel back that nothing altered, and a canvas the page is not
 * allowed to read. So the read-and-write-back is one function and both are
 * settled in it.
 */

/**
 * Runs `edit` over a device-space region, writing back only if it changed.
 *
 * Returns whether the pixels were written, which is not the same question as
 * whether the edit wanted to: a cross-origin source without CORS taints the
 * canvas and `getImageData` throws. Every caller here treats that as "leave the
 * picture as it is", but the redaction does not — it must still hide something
 * — so the answer is returned rather than assumed.
 */
export function editPixels(
  context: Canvas2D,
  region: Rect,
  edit: (pixels: Uint8ClampedArray, width: number, height: number) => boolean,
): boolean {
  if (region.width < 1 || region.height < 1) return false;
  try {
    const image = context.getImageData(region.x, region.y, region.width, region.height);
    // Nothing changed means nothing to write: putting a megapixel back
    // unaltered costs the same as putting it back altered.
    if (!edit(image.data, image.width, image.height)) return false;
    context.putImageData(image, region.x, region.y);
    return true;
  } catch {
    return false;
  }
}

/** The adjustments this engine could not express as a filter. */
export function adjustPixels(context: Canvas2D, op: Extract<DrawOp, { op: "adjust-pixels" }>): void {
  // The pixel calls ignore the transform, but what follows does not, and this
  // op is the boundary between drawing the picture and drawing over it.
  context.setTransform(1, 0, 0, 1, 0, 0);
  editPixels(context, { x: 0, y: 0, width: op.width, height: op.height }, (pixels) =>
    applyAdjustmentsToImageData(pixels, op.adjustments),
  );
}

/** The host's own colour transform, over the whole target. */
export function transformColours(context: Canvas2D, op: Extract<DrawOp, { op: "colour-matrix" }>): void {
  editPixels(context, { x: 0, y: 0, width: op.width, height: op.height }, (pixels) =>
    applyColourMatrix(pixels, op.matrix),
  );
}
