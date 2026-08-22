import { scaleToFit } from "../geometry/rect.js";
import type { Size } from "../geometry/types.js";
import { disposeImageSource, drawnSurface } from "../image/canvas.js";
import { drawResized } from "../image/resize.js";

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
 *
 * `PreviewProxy` below is what acts on it. The two live together because the
 * decision is worthless apart from the one thing that obeys it, and the manager
 * that used to hold both was answering two questions at once.
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

/** Four channels, one byte each: what a canvas costs per pixel. */
export const BYTES_PER_PIXEL = 4;

export interface PreviewBitmap {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** preview pixels per source pixel */
  scale: number;
}

/**
 * One resource's downscaled stand-in, made when it is first asked for and kept
 * until a bigger one is wanted.
 *
 * A moving source never gets one. The proxy exists to keep a 48-megapixel
 * photograph interactive by drawing a smaller copy of it, and a copy of a video
 * is one frame of it — the picture would freeze the moment the proxy was built.
 */
export class PreviewProxy {
  #bitmap: PreviewBitmap | null = null;
  #limit = 0;

  constructor(
    private readonly source: CanvasImageSource,
    private readonly size: Size,
    /** True for a source that runs, which is never proxied. See above. */
    private readonly moving: boolean,
  ) {}

  get(maxSize: number): PreviewBitmap {
    const whole: PreviewBitmap = { source: this.source, ...this.size, scale: 1 };
    if (this.moving) return whole;

    const plan = planPreview(this.size, maxSize, this.#bitmap ? this.#limit : null);
    if (this.#bitmap) {
      if (plan.kind === "cached") return this.#bitmap;
      // Released only once a new one is called for: until then the old proxy is
      // the one on screen.
      this.dispose();
    }

    this.#limit = maxSize;
    this.#bitmap = plan.kind === "render" ? this.#render(plan.target) : whole;
    return this.#bitmap;
  }

  /**
   * Roughly what the proxy costs on top of the source, in bytes.
   *
   * Zero when there is no proxy, and zero when the proxy *is* the source —
   * which is not the same thing and costs the same nothing.
   */
  bytes(): number {
    if (!this.#bitmap || this.#bitmap.source === this.source) return 0;
    return this.#bitmap.width * this.#bitmap.height * BYTES_PER_PIXEL;
  }

  dispose(): void {
    // A proxy that *is* the source is not ours to release — the resource owns it.
    if (this.#bitmap && this.#bitmap.source !== this.source) disposeImageSource(this.#bitmap.source);
    this.#bitmap = null;
  }

  #render(target: Size): PreviewBitmap {
    const surface = drawnSurface(target, (drawing) =>
      drawResized(drawing.context, this.source, this.size, target),
    );
    return { source: surface.canvas, ...target, scale: target.width / this.size.width };
  }
}
