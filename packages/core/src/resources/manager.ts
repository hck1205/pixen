import { PixenError } from "../errors/index.js";
import { scaleToFit } from "../geometry/rect.js";
import type { Size } from "../geometry/types.js";
import { createSurface, releaseSurface } from "../image/canvas.js";
import { decodeImage, disposeImageSource, type DecodeOptions, type ImageInput } from "../image/decode.js";
import { drawResized } from "../image/resize.js";
import { createId } from "../util/id.js";

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
  }): ImageResource {
    const resource: ImageResource = {
      id: input.id ?? createId("res"),
      width: input.width,
      height: input.height,
      source: input.source,
      blob: input.blob ?? null,
      mimeType: input.mimeType ?? "",
      ...(input.name ? { name: input.name } : {}),
      byteSize: input.blob?.size ?? input.width * input.height * 4,
    };
    this.#entries.set(resource.id, {
      resource,
      refCount: 1,
      preview: null,
      previewLimit: this.#previewMaxSize,
      released: false,
    });
    return resource;
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }

  get(id: string): ImageResource | undefined {
    return this.#entries.get(id)?.resource;
  }

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

    if (entry.preview && entry.previewLimit >= maxSize) return entry.preview;

    const { resource } = entry;
    const limit: Size = { width: maxSize, height: maxSize };
    const target = scaleToFit({ width: resource.width, height: resource.height }, limit);

    if (target.width === resource.width && target.height === resource.height) {
      const preview: PreviewBitmap = {
        source: resource.source,
        width: resource.width,
        height: resource.height,
        scale: 1,
      };
      entry.preview = preview;
      entry.previewLimit = maxSize;
      return preview;
    }

    if (entry.preview) this.#disposePreview(entry);

    const surface = createSurface(target.width, target.height);
    drawResized(
      surface.context,
      resource.source,
      { width: resource.width, height: resource.height },
      target,
    );

    const preview: PreviewBitmap = {
      source: surface.canvas,
      width: target.width,
      height: target.height,
      scale: target.width / resource.width,
    };
    entry.preview = preview;
    entry.previewLimit = maxSize;
    return preview;
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
