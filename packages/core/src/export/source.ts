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
import { standInSize } from "../image/resize.js";
import type { ImageResource } from "../resources/manager.js";
import type { ExportHooks } from "./hooks.js";

export interface StandIn {
  source: CanvasImageSource;
  /**
   * Stand-in pixels per source pixel; 1 when the source itself is drawn.
   *
   * How the scene is told, which is the same mechanism the preview proxy has
   * always used rather than a second way of saying it. It sizes the box the
   * stand-in is stretched into on its way to image space, so a host that returns
   * something other than the size it was asked for gets a slightly different
   * resampling resolution and the same picture, in the same place.
   */
  scale: number;
}

export async function standIn(
  resource: ImageResource,
  crop: Size,
  target: Size,
  resample: ExportHooks["resample"],
): Promise<StandIn> {
  const whole: StandIn = { source: resource.source, scale: 1 };
  if (!resample) return whole;

  const from: Size = { width: resource.width, height: resource.height };
  const to = standInSize(from, crop, target);
  if (to === null) return whole;

  return { source: await resample(resource.source, from, to), scale: to.width / from.width };
}
