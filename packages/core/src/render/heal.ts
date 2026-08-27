import type { Rect } from "../geometry/types.js";

/**
 * Taking a blemish out by growing the surroundings over it.
 *
 * The whole of retouching, at the only level where it is a decision rather than
 * plumbing: given a rectangle of pixels and an elliptical spot inside it, what
 * should the spot become?
 *
 * It becomes the boundary, diffused inwards. Every pixel in the spot looks
 * along four rays — left, right, up, down — to where each one leaves the
 * ellipse, reads the pixel just outside, and takes the average weighted by how
 * near each one is. A colour is therefore never invented: the result is made
 * only of pixels that were already there, and a spot on skin, on sky or on a
 * wall closes without a seam because the gradient either side of it carries
 * through.
 *
 * What it is not is content-aware fill. There is no texture here, so a blemish
 * over a striped shirt heals to a smear rather than to stripes — which is the
 * honest limit of anything that runs in a millisecond, and the reason the tool
 * is a spot remover rather than a promise.
 */

/** Channels in the buffer, named because `+ 3` for alpha is not obvious. */
const CHANNELS = 4;

/**
 * How much of the radius fades back to the original picture at the rim.
 *
 * Zero would leave a visible circle wherever the diffusion did not quite match
 * its surroundings; the fade is what makes the repair stop being a shape.
 */
export const DEFAULT_HEAL_FEATHER = 0.25;

/**
 * Heals an elliptical spot inscribed in `region`, in place.
 *
 * `feather` is a fraction of the radius, clamped to 0..1. Returns whether
 * anything was changed, so a caller can skip writing the buffer back.
 */
export function healRegion(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  region: Rect,
  feather = DEFAULT_HEAL_FEATHER,
): boolean {
  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(width, Math.ceil(region.x + region.width));
  const bottom = Math.min(height, Math.ceil(region.y + region.height));
  if (right - left < 1 || bottom - top < 1) return false;

  const centreX = (left + right) / 2;
  const centreY = (top + bottom) / 2;
  const radiusX = (right - left) / 2;
  const radiusY = (bottom - top) / 2;
  if (radiusX < 1 || radiusY < 1) return false;

  const softness = Math.min(1, Math.max(0, feather));
  // Read from a copy, for one case: a spot flush against an edge of the
  // picture. The boundary samples are clamped to the surface, so there they
  // land *inside* the spot, on a pixel this same pass may already have
  // repaired — and the repair would then feed on its own output. Measured, it
  // shifts those pixels by three or four levels out of 255, which is small and
  // is the difference between reading the picture and reading yourself.
  const source = pixels.slice();
  let changed = false;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const nx = (x + 0.5 - centreX) / radiusX;
      const ny = (y + 0.5 - centreY) / radiusY;
      const distance = Math.hypot(nx, ny);
      if (distance >= 1) continue;

      const spanX = radiusX * Math.sqrt(Math.max(0, 1 - ny * ny));
      const spanY = radiusY * Math.sqrt(Math.max(0, 1 - nx * nx));
      const rays: Array<[number, number]> = [
        [Math.floor(centreX - spanX) - 1, y],
        [Math.ceil(centreX + spanX), y],
        [x, Math.floor(centreY - spanY) - 1],
        [x, Math.ceil(centreY + spanY)],
      ];

      let weightSum = 0;
      const channels = [0, 0, 0, 0];
      for (const [sx, sy] of rays) {
        const cx = Math.min(width - 1, Math.max(0, sx));
        const cy = Math.min(height - 1, Math.max(0, sy));
        // Nearer boundaries carry more, which is what makes a gradient across
        // the spot rather than a flat average of its four edges.
        const weight = 1 / Math.max(1, Math.hypot(cx - x, cy - y));
        const at = (cy * width + cx) * CHANNELS;
        for (let c = 0; c < CHANNELS; c += 1) channels[c]! += source[at + c]! * weight;
        weightSum += weight;
      }
      if (weightSum === 0) continue;

      // Full strength through the middle, fading to nothing at the rim.
      const edge = softness === 0 ? 1 : Math.min(1, (1 - distance) / softness);
      const at = (y * width + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c += 1) {
        const healed = channels[c]! / weightSum;
        pixels[at + c] = source[at + c]! + (healed - source[at + c]!) * edge;
      }
      changed = true;
    }
  }

  return changed;
}
