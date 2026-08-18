import { PixenError, toPixenError } from "../errors/index.js";
import type { Size } from "../geometry/types.js";
import { assertDrawableSize, createSurface, releaseSurface } from "./canvas.js";
import {
  applyOrientationToSize,
  orientationTransform,
  readExifOrientation,
  type ExifOrientation,
} from "./exif.js";

export type ImageInput =
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | string;

export interface DecodedImage {
  /** Ready to hand to `drawImage`, already upright. */
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Original bytes when the input carried them, for size reporting and re-encode shortcuts. */
  blob: Blob | null;
  mimeType: string;
  /** The orientation found in the file; the returned source has it applied. */
  orientation: ExifOrientation;
  name?: string;
}

export interface DecodeOptions {
  signal?: AbortSignal;
  /** Skip EXIF normalisation when the caller knows the bytes are already upright. */
  respectExifOrientation?: boolean;
  /** Passed to `fetch` for string inputs. */
  crossOrigin?: RequestCredentials;
}

const EXIF_SCAN_BYTES = 256 * 1024;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PixenError("ABORTED", "Image decoding was aborted");
}

export async function toBlob(input: ImageInput, options: DecodeOptions = {}): Promise<Blob | null> {
  if (input instanceof Blob) return input;
  if (input instanceof ArrayBuffer) return new Blob([input]);
  if (ArrayBuffer.isView(input)) {
    return new Blob([input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer]);
  }
  if (typeof input === "string") {
    try {
      const response = await fetch(input, {
        signal: options.signal ?? null,
        credentials: options.crossOrigin ?? "same-origin",
      });
      if (!response.ok) {
        throw new PixenError("INVALID_IMAGE", `Fetching the image failed with HTTP ${response.status}`, {
          details: { status: response.status, url: input },
        });
      }
      return await response.blob();
    } catch (cause) {
      if (cause instanceof PixenError) throw cause;
      throw new PixenError(
        "CORS_ERROR",
        `Could not fetch "${input}". Check the URL and the server's CORS headers.`,
        { cause, details: { url: input } },
      );
    }
  }
  return null;
}

async function readOrientation(blob: Blob): Promise<ExifOrientation> {
  if (blob.type && blob.type !== "image/jpeg" && blob.type !== "image/tiff") return 1;
  try {
    const head = await blob.slice(0, Math.min(EXIF_SCAN_BYTES, blob.size)).arrayBuffer();
    return readExifOrientation(head) ?? 1;
  } catch {
    return 1;
  }
}

async function decodeBlob(blob: Blob, signal: AbortSignal | undefined): Promise<CanvasImageSource> {
  throwIfAborted(signal);
  if (typeof createImageBitmap === "function") {
    try {
      // "none" keeps orientation handling in our hands so every browser agrees.
      return (await createImageBitmap(blob, { imageOrientation: "none" })) as ImageBitmap;
    } catch (cause) {
      if (typeof Image === "undefined") {
        throw toPixenError(cause, "DECODE_FAILED", "The image could not be decoded");
      }
    }
  }
  return decodeWithImageElement(blob, signal);
}

function decodeWithImageElement(blob: Blob, signal: AbortSignal | undefined): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    image.onload = () => {
      cleanup();
      if (signal?.aborted) {
        reject(new PixenError("ABORTED", "Image decoding was aborted"));
        return;
      }
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new PixenError("DECODE_FAILED", "The image could not be decoded", { details: { type: blob.type } }));
    };
    image.src = url;
  });
}

/** Intrinsic pixel size of any drawable source. */
export function sourceSize(source: CanvasImageSource): Size {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  const candidate = source as unknown as Size;
  return { width: Number(candidate.width), height: Number(candidate.height) };
}

export interface UprightImage extends Size {
  source: CanvasImageSource;
}

/**
 * Bakes an EXIF orientation into pixels so nothing downstream has to know about
 * it. The size travels beside the source rather than being written onto it:
 * `ImageBitmap.width` is a read-only accessor, and assigning to it throws.
 */
export function normaliseOrientation(source: CanvasImageSource, orientation: ExifOrientation): UprightImage {
  const size = sourceSize(source);
  if (orientation === 1) return { source, ...size };

  const upright = applyOrientationToSize(size, orientation);
  assertDrawableSize(upright, "image");
  const surface = createSurface(upright.width, upright.height);
  const { rotation, flipX, flipY } = orientationTransform(orientation);

  const context = surface.context;
  context.translate(upright.width / 2, upright.height / 2);
  context.rotate(rotation);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(source, -size.width / 2, -size.height / 2, size.width, size.height);
  context.setTransform(1, 0, 0, 1, 0, 0);

  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close();
  return { source: surface.canvas, ...upright };
}

/**
 * Turns any supported input into an upright, drawable image.
 *
 * A `File`, `Blob`, `ArrayBuffer`, data URL, remote URL, `ImageBitmap`, `<img>`
 * or `<canvas>` all end up in the same shape, which is what lets the rest of the
 * engine ignore where an image came from.
 */
export async function decodeImage(input: ImageInput, options: DecodeOptions = {}): Promise<DecodedImage> {
  throwIfAborted(options.signal);

  const blob = await toBlob(input, options);
  const name = typeof File !== "undefined" && input instanceof File ? input.name : undefined;

  if (!blob) {
    // Already-decoded inputs are trusted as upright.
    const source = input as CanvasImageSource;
    const size = sourceSize(source);
    if (!size.width || !size.height) {
      throw new PixenError("INVALID_IMAGE", "The provided image source has no intrinsic size");
    }
    return { source, width: size.width, height: size.height, blob: null, mimeType: "", orientation: 1 };
  }

  if (blob.size === 0) {
    throw new PixenError("INVALID_IMAGE", "The provided file is empty");
  }
  if (blob.type && !blob.type.startsWith("image/")) {
    throw new PixenError("UNSUPPORTED_FORMAT", `"${blob.type}" is not an image type`, {
      details: { mimeType: blob.type },
    });
  }
  if (blob.type === "image/svg+xml") {
    throw new PixenError(
      "UNSUPPORTED_FORMAT",
      "SVG input is not accepted: rasterising untrusted SVG can execute embedded content.",
      { details: { mimeType: blob.type } },
    );
  }

  const orientation = options.respectExifOrientation === false ? 1 : await readOrientation(blob);
  const decoded = await decodeBlob(blob, options.signal);
  assertDrawableSize(sourceSize(decoded), "image");
  const upright = normaliseOrientation(decoded, orientation);

  return {
    source: upright.source,
    width: upright.width,
    height: upright.height,
    blob,
    mimeType: blob.type || "application/octet-stream",
    orientation,
    ...(name ? { name } : {}),
  };
}

export function disposeImageSource(source: CanvasImageSource | null | undefined): void {
  if (!source) return;
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
    return;
  }
  if (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) {
    releaseSurface({ canvas: source, context: null as never });
    return;
  }
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    releaseSurface({ canvas: source, context: null as never });
  }
}
