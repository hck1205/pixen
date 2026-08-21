import { PixenError } from "../errors/index.js";
import type { Size } from "../geometry/types.js";
import { createSurface, disposeImageSource, releaseSurface } from "../image/canvas.js";
import { decodeImage, type DecodeOptions, type ImageInput } from "../image/decode.js";
import { drawResized } from "../image/resize.js";
import { createId } from "../util/id.js";
import { planPreview } from "./preview.js";

export interface PreviewBitmap {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** preview pixels per source pixel */
  scale: number;
}

export interface ImageResource {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** Full-resolution, upright, drawable. */
  readonly source: CanvasImageSource;
  readonly blob: Blob | null;
  /**
   * Seconds, for a source that runs rather than sits still.
   *
   * Also the flag that it does. A resource with a duration is never proxied
   * into a preview bitmap: a downscaled copy of a moving picture is one frame
   * of it, held forever.
   */
  readonly duration?: number;
  readonly mimeType: string;
  readonly name?: string;
  readonly byteSize: number;
}

interface ResourceEntry {
  resource: ImageResource;
  refCount: number;
  preview: PreviewBitmap | null;
  previewLimit: number;
  released: boolean;
  /** The adopter's own teardown, run once when the entry is let go. */
  dispose?: () => void;
}

/**
 * Longest edge of the preview bitmap, and the floor below which a preview stops
 * being useful. Editing at preview resolution and exporting at full resolution
 * is what keeps a 48-megapixel image interactive on a phone.
 */
export const DEFAULT_PREVIEW_MAX_SIZE = 2048;
const MIN_PREVIEW_MAX_SIZE = 64;

export interface ResourceManagerOptions {
  /** Longest edge of the preview bitmap the editor renders while interacting. */
  previewMaxSize?: number;
}

/**
 * Owns every runtime object a document refers to.
 *
 * Documents store a `resourceId` and nothing else: bitmaps, blobs and future GPU
 * textures live here, which is what keeps documents JSON-serialisable and makes
 * memory reclaimable at a known point in time.
 */
export class ResourceManager {
  #entries = new Map<string, ResourceEntry>();
  #previewMaxSize: number;

  constructor(options: ResourceManagerOptions = {}) {
    this.#previewMaxSize = options.previewMaxSize ?? DEFAULT_PREVIEW_MAX_SIZE;
  }

  get previewMaxSize(): number {
    return this.#previewMaxSize;
  }

  set previewMaxSize(value: number) {
    this.#previewMaxSize = Math.max(MIN_PREVIEW_MAX_SIZE, Math.round(value));
  }

  /** Decodes any supported input and registers the result. */
  async load(input: ImageInput, options: DecodeOptions = {}): Promise<ImageResource> {
    const decoded = await decodeImage(input, options);
    return this.adopt({
      source: decoded.source,
      width: decoded.width,
      height: decoded.height,
      blob: decoded.blob,
      mimeType: decoded.mimeType,
      ...(decoded.name ? { name: decoded.name } : {}),
    });
  }

  /** Registers an already-decoded image. The manager takes ownership of `source`. */
  adopt(input: {
    source: CanvasImageSource;
    width: number;
    height: number;
    blob?: Blob | null;
    mimeType?: string;
    name?: string;
    id?: string;
    /** Seconds, for a source that runs. See `ImageResource.duration`. */
    duration?: number;
    /**
     * Undoes whatever the caller set up, when the resource is let go.
     *
     * `disposeImageSource` can close an `ImageBitmap` and hand a canvas back to
     * the pool, because it can recognise those. It cannot know that a source is
     * a `<video>` reading from an object URL, or a texture on a context it has
     * never heard of — so a caller that adopted something with a tail says so
     * here, and the manager calls it exactly once.
     */
    dispose?: () => void;
  }): ImageResource {
    const resource: ImageResource = {
      id: input.id ?? createId("res"),
      width: input.width,
      height: input.height,
      source: input.source,
      blob: input.blob ?? null,
      mimeType: input.mimeType ?? "",
      ...(input.name ? { name: input.name } : {}),
      ...(input.duration === undefined ? {} : { duration: input.duration }),
      byteSize: input.blob?.size ?? input.width * input.height * 4,
    };
    this.#entries.set(resource.id, {
      resource,
      refCount: 1,
      preview: null,
      previewLimit: this.#previewMaxSize,
      released: false,
      ...(input.dispose ? { dispose: input.dispose } : {}),
    });
    return resource;
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }

  get(id: string): ImageResource | undefined {
    return this.#entries.get(id)?.resource;
  }

  /**
   * The bitmap an image layer refers to, or null when it is gone.
   *
   * Bound to the instance so it can be handed straight to `createScene`, which
   * is the one place that needs to turn a `resourceId` back into pixels. A
   * missing resource is not an error here: a document can outlive the sticker it
   * referenced, and the renderer draws nothing rather than throwing mid-frame.
   */
  resolve = (id: string): CanvasImageSource | null => this.#entries.get(id)?.resource.source ?? null;

  /** Like `get`, but states which invariant broke instead of returning undefined. */
  require(id: string): ImageResource {
    const entry = this.#entries.get(id);
    if (!entry) {
      throw new PixenError("RESOURCE_MISSING", `No resource registered for id "${id}"`, { details: { id } });
    }
    if (entry.released) {
      throw new PixenError("RESOURCE_RELEASED", `Resource "${id}" has already been released`, { details: { id } });
    }
    return entry.resource;
  }

  retain(id: string): ImageResource {
    const entry = this.#entries.get(id);
    if (!entry) {
      throw new PixenError("RESOURCE_MISSING", `No resource registered for id "${id}"`, { details: { id } });
    }
    entry.refCount += 1;
    return entry.resource;
  }

  /** Drops one reference; the last one out frees the bitmaps. */
  release(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount <= 0) this.dispose(id);
  }

  /**
   * A downscaled bitmap for interactive rendering. Editing at preview resolution
   * and exporting at full resolution is deliberate: a 48 MP source stays
   * responsive without ever degrading the exported pixels.
   */
  getPreview(id: string, maxSize = this.#previewMaxSize): PreviewBitmap {
    const entry = this.#entries.get(id);
    if (!entry || entry.released) {
      throw new PixenError("RESOURCE_MISSING", `No resource registered for id "${id}"`, { details: { id } });
    }

    const { resource } = entry;
    const size: Size = { width: resource.width, height: resource.height };

    // A moving source is drawn from directly, however large it is. The proxy
    // exists to keep a 48-megapixel photograph interactive by drawing a smaller
    // copy of it — and a copy of a video is one frame of it, so the picture
    // would freeze the moment the proxy was built.
    if (resource.duration !== undefined) return { source: resource.source, ...size, scale: 1 };

    const cached = entry.preview;
    const plan = planPreview(size, maxSize, cached ? entry.previewLimit : null);
    if (cached) {
      if (plan.kind === "cached") return cached;
      // Released only once a new one is called for: until then the old proxy is
      // the one on screen.
      this.#disposePreview(entry);
    }

    entry.previewLimit = maxSize;
    entry.preview =
      plan.kind === "render"
        ? this.#renderPreview(resource.source, size, plan.target)
        : { source: resource.source, ...size, scale: 1 };
    return entry.preview;
  }

  #renderPreview(source: CanvasImageSource, size: Size, target: Size): PreviewBitmap {
    const surface = createSurface(target.width, target.height);
    drawResized(surface.context, source, size, target);
    return { source: surface.canvas, ...target, scale: target.width / size.width };
  }

  #disposePreview(entry: ResourceEntry): void {
    if (entry.preview && entry.preview.source !== entry.resource.source) {
      disposeImageSource(entry.preview.source);
    }
    entry.preview = null;
  }

  /** Frees a resource regardless of its reference count. */
  dispose(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    this.#disposePreview(entry);
    disposeImageSource(entry.resource.source);
    // The caller's own teardown runs after ours and cannot stop the rest of the
    // release: a host that throws in here would otherwise leak the entry it was
    // trying to clean up after.
    try {
      entry.dispose?.();
    } catch {
      // Nothing useful to do with it, and nothing left that depends on it.
    }
    entry.released = true;
    this.#entries.delete(id);
  }

  disposeAll(): void {
    for (const id of [...this.#entries.keys()]) this.dispose(id);
  }

  /** Rough accounting, useful for the playground and for memory regression tests. */
  stats(): { count: number; approximateBytes: number } {
    let approximateBytes = 0;
    for (const entry of this.#entries.values()) {
      approximateBytes += entry.resource.width * entry.resource.height * 4;
      if (entry.preview && entry.preview.source !== entry.resource.source) {
        approximateBytes += entry.preview.width * entry.preview.height * 4;
      }
    }
    return { count: this.#entries.size, approximateBytes };
  }
}

export { releaseSurface };
