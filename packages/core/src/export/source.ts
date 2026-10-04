/**
 * The picture an export draws from.
 *
 * Usually the source bitmap itself. A host that wants a large downscale done its
 * own way — a better filter than the browser's, or a step-down chain on an
 * engine it has measured — puts one in through `hooks.resample`, and this is
 * where it lands.
 *
 * Pixen does not pre-shrink on its own. The received wisdom is that a single
 * `drawImage` shrinking by more than about half keeps one sample per output
 * pixel and turns fine detail into aliasing, which is why `drawResized` halves
 * in steps for the preview. Measured on Chromium that is not true of an export:
 * halving first lands no closer to the true area average than one draw does, and
 * costs about half a second on a 24-megapixel source. So the cost is not
 * imposed — the seam is offered instead.
 */
import type { Size } from "../geometry/types.js";
import { sourceSize } from "../image/canvas.js";
import { standInSize } from "../image/resize/plan.js";
import type { ImageResource } from "../resources/manager.js";
import type { ExportHooks } from "./hooks.js";

/**
 * The picture this export draws from.
 *
 * Only the bitmap comes back. Its size is nobody's business downstream: the
 * scene says where the picture goes in image space and the executor stretches
 * whatever it is handed into that box, so a stand-in of any size lands in the
 * same place at a different resolution.
 */
export async function standIn(
  resource: ImageResource,
  crop: Size,
  target: Size,
  hooks: Pick<ExportHooks, "source" | "resample">,
): Promise<CanvasImageSource> {
  const original: Size = { width: resource.width, height: resource.height };

  // The host's own picture for this one export, if it supplied one. Measured
  // rather than assumed to be the same size, because the resample below has to
  // know what it is shrinking.
  const swapped = hooks.source ? await hooks.source(resource.source, original) : resource.source;
  if (!hooks.resample) return swapped;

  const from = hooks.source ? sourceSize(swapped) : original;
  const to = standInSize(from, crop, target);
  if (to === null) return swapped;

  return hooks.resample(swapped, from, to);
}
