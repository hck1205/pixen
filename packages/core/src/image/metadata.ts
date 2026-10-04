/**
 * Carrying a photograph's own record of itself into the exported file.
 *
 * A camera writes a great deal into a JPEG that the pixels do not say: the
 * make and model, the lens, the exposure, when the shutter opened, who holds
 * the copyright. Re-encoding a canvas throws all of it away, which for an
 * archive or a photographer's workflow is a real loss — the edited copy stops
 * being the same picture in every way except the pixels.
 *
 * Three things in that record must not travel, and they are the reason this is
 * a rewrite rather than a copy:
 *
 * - **The orientation.** Pixen turns the pixels upright at decode, so the tag
 *   has already been spent. Copying it tells the next reader to turn them again.
 * - **The location.** A photograph taken on a phone usually knows where it was
 *   taken, and a person sharing an edited copy is not thereby offering their
 *   home address. It is erased, not merely unreferenced.
 * - **The thumbnail.** This is the one worth stopping at. EXIF can embed a small
 *   copy of the *original* picture, and that copy predates every edit — the crop
 *   that removed someone, the redaction over a face, the sticker over a licence
 *   plate. Shipped inside the exported file, it hands back exactly what the edit
 *   was for. It is erased too.
 *
 * What is left is what the camera knew about itself, which is what a host asking
 * for metadata is asking for.
 *
 * Only the policy lives here. How a directory is laid out — where an entry keeps
 * its value, how to drop one, which way round the numbers are — is `tiff.ts`.
 */
import { findExifSegment } from "./jpeg.js";
import {
  directoryAt,
  eraseDirectory,
  eraseRange,
  findEntry,
  firstDirectory,
  nextDirectoryPointer,
  readLong,
  readTiffBlock,
  removeEntry,
  writeShortValue,
  type TiffBlock,
} from "./tiff.js";

/**
 * `strip` is the default, and stays the default. Most images on the web are
 * shared rather than archived, and the safe thing to do with a record nobody
 * asked for is not to publish it.
 */
export const METADATA_POLICIES = ["strip", "copy"] as const;
export type MetadataPolicy = (typeof METADATA_POLICIES)[number];

const ORIENTATION_TAG = 0x0112;
const GPS_DIRECTORY_TAG = 0x8825;
const THUMBNAIL_OFFSET_TAG = 0x0201;
const THUMBNAIL_LENGTH_TAG = 0x0202;
/** Orientation 1: the pixels are already the right way up. */
const UPRIGHT = 1;

/**
 * The source's EXIF block, rewritten so it can be attached to edited pixels —
 * or `null` when there is nothing to carry.
 *
 * The result is a complete APP1 segment, ready for `withExifSegment`, and the
 * same length as the original: what must not travel is overwritten with zeroes
 * and the entry pointing at it is dropped, which leaves a little dead space
 * rather than requiring every offset in the block to be recalculated.
 */
export function portableExif(source: ArrayBufferLike): Uint8Array | null {
  const segment = findExifSegment(new DataView(source as ArrayBuffer));
  if (!segment) return null;

  // A copy, because everything below writes: the caller's file is not ours.
  const bytes = new Uint8Array((source as ArrayBuffer).slice(segment.start, segment.end));
  const block = readTiffBlock(bytes, segment.tiffStart - segment.start);
  if (!block) return null;

  const first = firstDirectory(block);
  if (first === null) return null;

  setUpright(block, first);
  eraseThumbnail(block, first);
  eraseLocation(block, first);
  return bytes;
}

/**
 * The pixels are upright by the time anything reads this, so the tag has to say
 * so. Written rather than removed: a reader that finds no orientation assumes 1
 * anyway, but one that finds it stated cannot be talked out of it by a stray
 * copy elsewhere in the file.
 */
function setUpright(block: TiffBlock, directory: number): void {
  const entry = findEntry(block, directory, ORIENTATION_TAG);
  if (entry) writeShortValue(block, entry, UPRIGHT);
}

/**
 * Drops the second directory, which is where a camera keeps its thumbnail of
 * the picture as it was before anybody edited it.
 *
 * The image bytes go first, then the directory that described them, then the
 * pointer that led here — in that order, so a failure part way through leaves
 * less behind rather than more.
 */
function eraseThumbnail(block: TiffBlock, directory: number): void {
  const pointer = nextDirectoryPointer(block, directory);
  if (pointer === null) return;
  const thumbnail = directoryAt(block, pointer);
  if (thumbnail === null) return;

  const offset = findEntry(block, thumbnail, THUMBNAIL_OFFSET_TAG);
  const length = findEntry(block, thumbnail, THUMBNAIL_LENGTH_TAG);
  if (offset && length) {
    eraseRange(block, block.start + readLong(block, offset.valueAt), readLong(block, length.valueAt));
  }
  eraseDirectory(block, thumbnail);
  block.view.setUint32(pointer, 0, block.littleEndian);
}

/**
 * Erases where the picture was taken, and then the entry that pointed at it.
 *
 * Removing only the entry would leave the coordinates sitting in the file for
 * anyone who reads it with something other than an EXIF parser, which is not
 * what "the location is not in this file" should mean.
 */
function eraseLocation(block: TiffBlock, directory: number): void {
  const entry = findEntry(block, directory, GPS_DIRECTORY_TAG);
  if (!entry) return;

  const gps = directoryAt(block, entry.valueAt);
  if (gps !== null) eraseDirectory(block, gps);
  removeEntry(block, directory, entry);
}
