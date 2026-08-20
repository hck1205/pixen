import { scaleToFit } from "../geometry/rect.js";
import type { Size } from "../geometry/types.js";

/**
 * Which preview bitmap a request needs, and at what size.
 *
 * The rule this holds is the one behind "a 48-megapixel source stays
 * responsive": the editor renders a downscaled proxy and exports from the
 * original. Getting it wrong is quiet in both directions — re-rendering a proxy
 * that was already good enough costs a full downscale on every frame, and
 * reusing one that is too small puts a blurry picture on screen — so the
 * decision is a pure function with a test rather than three branches inside a
 * cache.
 */
export type PreviewPlan =
  | { kind: "cached" }
  | { kind: "source" }
  | { kind: "render"; target: Size };

export function planPreview(source: Size, maxSize: number, cachedLimit: number | null): PreviewPlan {
  // A proxy built for a larger limit is already better than the one being asked
  // for, so it is reused rather than re-rendered smaller.
  if (cachedLimit !== null && cachedLimit >= maxSize) return { kind: "cached" };

  const target = scaleToFit(source, { width: maxSize, height: maxSize });
  // Nothing to downscale: the source is already inside the limit, and copying
  // it would cost a second full-size bitmap for no benefit at all.
  if (target.width === source.width && target.height === source.height) return { kind: "source" };

  return { kind: "render", target };
}
