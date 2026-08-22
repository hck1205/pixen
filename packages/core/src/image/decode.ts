import { PixenError, toPixenError } from "../errors/index.js";
import type { StepReporter } from "../util/progress.js";
import { assertDrawableSize, disposeImageSource, sourceSize } from "./canvas.js";
import { throwIfAborted } from "../util/abort.js";
import { toBlob } from "./bytes.js";
import { imageWorker } from "./worker/client.js";
import { uprightImage, type UprightImage } from "./auto-orient.js";
import { readExifOrientation, type ExifOrientation } from "./exif.js";

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
  /**
   * The decoded pixels, before the editor takes them as the picture.
   *
   * `beforeDecode` is the seam for bytes no browser reads; this is the one for
   * pixels the host wants changed before anyone edits them — a colour profile
   * the browser ignored, a denoiser or upscaler compiled to WebAssembly, a white
   * background composited under a transparent PNG, a scan straightened by a
   * model. Doing any of that through `beforeDecode` would mean decoding and
   * re-encoding to get at the pixels, which is slower and, for a lossy format,
   * lossy.
   *
   * The picture arrives upright, so a hook never has to think about EXIF. Return
   * a source of any size — at load it simply is the size; through
   * `replaceSource` the aspect ratio has to match, and the document's geometry
   * is rescaled to it. Draw onto the surface you were handed and return it and
   * nothing is copied.
   *
   * `blob` in the result stays the bytes that were decoded, so the byte size a
   * host reports and the metadata an export can carry still describe the file
   * the picture came from.
   */
  afterDecode?: (image: UprightImage, signal?: AbortSignal) => CanvasImageSource | Promise<CanvasImageSource>;
}

const EXIF_SCAN_BYTES = 256 * 1024;
/** What a cancelled decode calls itself, wherever it is noticed. */
const DECODE = "Image decoding";

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

/**
 * Whether a decode is worth moving off the main thread.
 *
 * Named and exported for the same reason as its encode counterpart: the
 * threshold is quoted on the coverage page, and a number stated in prose and
 * checked by nothing is a number that drifts.
 */
export function worthDecodingOffThread(bytes: number): boolean {
  return bytes >= WORKER_DECODE_MIN_BYTES;
}

async function decodeBlob(blob: Blob, signal: AbortSignal | undefined): Promise<CanvasImageSource> {
  throwIfAborted(signal, DECODE);

  if (worthDecodingOffThread(blob.size)) {
    // Null when the environment has no worker, or a policy forbids one; the
    // main-thread path below is then exactly what ran before.
    const offloaded = await imageWorker().decode(blob);
    throwIfAborted(signal, DECODE);
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
        reject(new PixenError("ABORTED", `${DECODE} was aborted`));
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

/**
 * Turns any supported input into an upright, drawable image.
 *
 * A `File`, `Blob`, `ArrayBuffer`, data URL, remote URL, `ImageBitmap`, `<img>`
 * or `<canvas>` all end up in the same shape, which is what lets the rest of the
 * engine ignore where an image came from.
 */
export async function decodeImage(input: ImageInput, options: DecodeOptions = {}): Promise<DecodedImage> {
  throwIfAborted(options.signal, DECODE);

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
  throwIfAborted(options.signal, DECODE);

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
  const upright = await uprightImage(decoded, orientation, (blob) => decodeBlob(blob, undefined));
  const ready = options.afterDecode ? await runAfterDecode(upright, options) : upright;

  return {
    source: ready.source,
    width: ready.width,
    height: ready.height,
    blob: decodable,
    mimeType: decodable.type || "application/octet-stream",
    orientation,
    ...(name ? { name } : {}),
  };
}

/**
 * Hands the decoded picture to the host, and takes back whatever it returns.
 *
 * The source is released only when the hook swapped it for a different one:
 * drawing onto the surface it was given and returning that is the cheap path,
 * and freeing it would take the picture away.
 */
async function runAfterDecode(image: UprightImage, options: DecodeOptions): Promise<UprightImage> {
  const replacement = await options.afterDecode!(image, options.signal);
  throwIfAborted(options.signal, DECODE);

  const size = sourceSize(replacement);
  assertDrawableSize(size, "image");
  if (replacement !== image.source) disposeImageSource(image.source);
  return { source: replacement, ...size };
}
