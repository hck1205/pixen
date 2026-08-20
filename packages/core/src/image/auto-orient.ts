/**
 * Whether this browser's decoder already turns a photograph upright.
 *
 * EXIF orientation used to be something an application did for itself: the
 * decoder handed back the pixels as stored, and turning them was the caller's
 * job. That is no longer true everywhere. Chromium applies all eight
 * orientations itself, and — measured, not assumed — `imageOrientation: "none"`
 * does not opt out of it for a blob decode. A library that rotates on top of
 * that turns every rotated photograph twice, which is a picture on its side.
 *
 * Asking cannot be done from a version number or a feature test: there is no
 * flag for it, and the behaviour has changed inside browsers that report the
 * same capabilities. So the decoder is handed a picture whose right way up is
 * known and asked what it makes of it. Once, lazily, and only when there is a
 * rotated image to decide about.
 *
 * One answer covers the worker path as well as the main-thread one: both make
 * the same request of the same engine, and a worker's decoder is not a
 * different decoder.
 */
import {
  assertDrawableSize,
  createSurface,
  disposeImageSource,
  releaseSurface,
  sourceSize,
} from "./canvas.js";
import { applyOrientationToSize, orientationTransform, type ExifOrientation } from "./exif.js";
import type { Size } from "../geometry/types.js";
import { encodeSurface } from "./encode.js";
import { withExifSegment } from "./jpeg.js";

/**
 * An APP1 block saying nothing but "orientation 6", which is a quarter turn.
 *
 *   FF E1        APP1
 *   00 22        34 bytes, counting these two
 *   "Exif" 00 00 what kind of APP1 this is
 *   4D 4D        big-endian ("MM"), which the rest of this is written in
 *   00 2A        TIFF's magic number
 *   00 00 00 08  the first directory starts eight bytes in, right here
 *   00 01        one entry
 *   01 12 00 03  tag 0x0112 (orientation), type 3 (SHORT)
 *   00 00 00 01  one of them
 *   00 06 00 00  the value, in the top half of its four-byte slot
 *   00 00 00 00  no directory after this one
 */
const QUARTER_TURN_EXIF = new Uint8Array([
  0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** Wider than it is tall, so a quarter turn is visible in the size alone. */
const PROBE_WIDTH = 8;
const PROBE_HEIGHT = 2;
/** Nothing is being looked at, only measured, so the quality is irrelevant. */
const PROBE_QUALITY = 0.5;

let answer: Promise<boolean> | null = null;

/**
 * True when the decoder turns a tagged picture upright by itself.
 *
 * Cached for the lifetime of the module: it is a property of the browser, and
 * the probe costs an encode and a decode that nobody should pay twice.
 *
 * Answers `false` if anything goes wrong. That is the conservative direction —
 * Pixen then does the turning, which is what it did before this existed, and a
 * mistake shows up as an upside-down picture rather than as a picture that
 * failed to open.
 */
export function decoderAppliesOrientation(decode: (blob: Blob) => Promise<CanvasImageSource>): Promise<boolean> {
  answer ??= probe(decode).catch(() => false);
  return answer;
}

async function probe(decode: (blob: Blob) => Promise<CanvasImageSource>): Promise<boolean> {
  const surface = createSurface(PROBE_WIDTH, PROBE_HEIGHT);
  let jpeg: Blob;
  try {
    jpeg = await encodeSurface(surface.canvas, "image/jpeg", PROBE_QUALITY);
  } finally {
    releaseSurface(surface);
  }

  const bytes = withExifSegment(new Uint8Array(await jpeg.arrayBuffer()), QUARTER_TURN_EXIF);
  const decoded = await decode(new Blob([bytes as BlobPart], { type: "image/jpeg" }));

  // Eight by two went in. Two by eight coming back means the decoder turned it.
  const width = Number((decoded as { width?: number }).width);
  const height = Number((decoded as { height?: number }).height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  disposeImageSource(decoded);
  return height > width;
}

export interface UprightImage extends Size {
  source: CanvasImageSource;
}

/**
 * A decoded picture, the right way up.
 *
 * The turn owed to it is the file's orientation, or none at all because the
 * decoder has already done it. The probe is only reached for when there is
 * something to decide, so a library of upright images never pays for it.
 */
export async function uprightImage(
  decoded: CanvasImageSource,
  orientation: ExifOrientation,
  decode: (blob: Blob) => Promise<CanvasImageSource>,
): Promise<UprightImage> {
  const size = sourceSize(decoded);
  if (orientation === 1 || (await decoderAppliesOrientation(decode))) return { source: decoded, ...size };
  return turn(decoded, size, orientation);
}

/**
 * Bakes an orientation into pixels so nothing downstream has to know about it.
 * The size travels beside the source rather than being written onto it:
 * `ImageBitmap.width` is a read-only accessor, and assigning to it throws.
 */
function turn(source: CanvasImageSource, size: Size, orientation: ExifOrientation): UprightImage {
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

  disposeImageSource(source);
  return { source: surface.canvas, ...upright };
}
