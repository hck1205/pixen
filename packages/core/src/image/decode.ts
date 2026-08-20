import { PixenError, toPixenError } from "../errors/index.js";
import type { Size } from "../geometry/types.js";
import type { StepReporter } from "../util/progress.js";
import { assertDrawableSize, createSurface, releaseCanvas } from "./canvas.js";
import { toBlob } from "./bytes.js";
import { imageWorker } from "./worker/client.js";
import { decoderAppliesOrientation } from "./auto-orient.js";
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
  /**
   * The bytes the pixels were decoded from, when the input carried any — for
   * size reporting and re-encode shortcuts. After a `beforeDecode` conversion
   * these are the converted bytes, not the ones the host was originally given.
   */
  blob: Blob | null;
  mimeType: string;
  /** The orientation found in the file; the returned source has it applied. */
  orientation: ExifOrientation;
  name?: string;
}

/**
 * The steps of turning an input into pixels that are worth reporting.
 *
 * Only `fetch` can be counted: it is bytes over a network, and the server
 * usually says how many. A decode is one call into the browser that returns
 * when it returns, so it reports its start and nothing else rather than
 * inventing a percentage.
 */
export type DecodeStage = "fetch" | "decode";

export interface DecodeOptions {
  signal?: AbortSignal;
  /** Called as the input is fetched and decoded. See `DecodeStage`. */
  onProgress?: StepReporter<DecodeStage>;
  /** Skip EXIF normalisation when the caller knows the bytes are already upright. */
  respectExifOrientation?: boolean;
  /** Passed to `fetch` for string inputs. */
  crossOrigin?: RequestCredentials;
  /** Sent with the request for a string input — a bearer token, a tenant id. */
  headers?: Record<string, string>;
  /**
   * Turns bytes no browser can decode into bytes it can, before anything tries.
   *
   * HEIC is the case this exists for: every recent iPhone produces it and no
   * browser reads it, so a host drops a converter in here rather than
   * pre-converting every file it might ever be handed. Bundling one ourselves
   * would mean a megabyte of decoder in everyone's build for a format most
   * applications never see.
   */
  beforeDecode?: (input: Blob, signal?: AbortSignal) => Blob | Promise<Blob>;
}

const EXIF_SCAN_BYTES = 256 * 1024;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PixenError("ABORTED", "Image decoding was aborted");
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

/**
 * Below this, the round trip to a worker costs more than the decode saves.
 * Above it, a decode on the main thread is long enough to be felt.
 */
const WORKER_DECODE_MIN_BYTES = 512 * 1024;

async function decodeBlob(blob: Blob, signal: AbortSignal | undefined): Promise<CanvasImageSource> {
  throwIfAborted(signal);

  if (blob.size >= WORKER_DECODE_MIN_BYTES) {
    // Null when the environment has no worker, or a policy forbids one; the
    // main-thread path below is then exactly what ran before.
    const offloaded = await imageWorker().decode(blob);
    throwIfAborted(signal);
    if (offloaded) return offloaded.bitmap;
  }

  if (typeof createImageBitmap === "function") {
    try {
      // Asks for the pixels as stored. Chromium ignores it and turns them
      // anyway, which is why `decoderAppliesOrientation` measures rather than
      // trusts — but engines that honour it are then handed a consistent
      // starting point, so it is still worth asking for.
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
 * The turn still owed to a decoded picture — the file's orientation, or none
 * because the decoder already did it.
 *
 * The probe is only reached for when there is something to decide, so a library
 * of upright images never pays for it.
 */
async function outstandingOrientation(orientation: ExifOrientation): Promise<ExifOrientation> {
  if (orientation === 1) return 1;
  return (await decoderAppliesOrientation((blob) => decodeBlob(blob, undefined))) ? 1 : orientation;
}

/**
 * Bakes an EXIF orientation into pixels so nothing downstream has to know about
 * it. The size travels beside the source rather than being written onto it:
 * `ImageBitmap.width` is a read-only accessor, and assigning to it throws.
 */
function normaliseOrientation(source: CanvasImageSource, orientation: ExifOrientation): UprightImage {
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

  // Before the format checks, not after: the point of the hook is to hand back
  // something those checks will accept.
  const decodable = options.beforeDecode ? await options.beforeDecode(blob, options.signal) : blob;
  throwIfAborted(options.signal);

  if (decodable.type && !decodable.type.startsWith("image/")) {
    throw new PixenError("UNSUPPORTED_FORMAT", `"${decodable.type}" is not an image type`, {
      details: { mimeType: decodable.type },
    });
  }
  if (decodable.type === "image/svg+xml") {
    throw new PixenError(
      "UNSUPPORTED_FORMAT",
      "SVG input is not accepted: rasterising untrusted SVG can execute embedded content.",
      { details: { mimeType: decodable.type } },
    );
  }

  // Everything below reads the bytes the pixels actually came from. Reading the
  // orientation off the original would be wrong the moment a conversion moved
  // the EXIF block, and re-encode shortcuts have to agree with what was decoded.
  const orientation = options.respectExifOrientation === false ? 1 : await readOrientation(decodable);
  options.onProgress?.({ stage: "decode", loaded: 0, total: null });
  const decoded = await decodeBlob(decodable, options.signal);
  assertDrawableSize(sourceSize(decoded), "image");
  const upright = normaliseOrientation(decoded, await outstandingOrientation(orientation));

  return {
    source: upright.source,
    width: upright.width,
    height: upright.height,
    blob: decodable,
    mimeType: decodable.type || "application/octet-stream",
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
    releaseCanvas(source);
    return;
  }
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    releaseCanvas(source);
  }
}
