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
 */
import { findExifSegment } from "./jpeg.js";

/**
 * `strip` is the default, and stays the default. Most images on the web are
 * shared rather than archived, and the safe thing to do with a record nobody
 * asked for is not to publish it.
 */
export const METADATA_POLICIES = ["strip", "copy"] as const;
export type MetadataPolicy = (typeof METADATA_POLICIES)[number];

const ORIENTATION_TAG = 0x0112;
const GPS_IFD_TAG = 0x8825;
const THUMBNAIL_OFFSET_TAG = 0x0201;
const THUMBNAIL_LENGTH_TAG = 0x0202;
/** Orientation 1: the pixels are already the right way up. */
const UPRIGHT = 1;

const LITTLE_ENDIAN_MARK = 0x4949;
const BIG_ENDIAN_MARK = 0x4d4d;
const TIFF_MAGIC = 0x002a;
const TIFF_HEADER_BYTES = 8;

const ENTRY_BYTES = 12;
const ENTRY_COUNT_BYTES = 2;
const NEXT_IFD_BYTES = 4;
/** A value this size or smaller is stored in the entry itself. */
const INLINE_VALUE_BYTES = 4;

/** Bytes per component, by TIFF type code. Unknown types are left alone. */
const TYPE_BYTES: Readonly<Record<number, number>> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

interface Tiff {
  bytes: Uint8Array;
  view: DataView;
  /** Offset of the TIFF header, which every offset inside the block counts from. */
  start: number;
  /** One past the last byte that belongs to this block. */
  end: number;
  littleEndian: boolean;
}

/**
 * The source's EXIF block, rewritten so it can be attached to edited pixels —
 * or `null` when there is nothing to carry.
 *
 * The result is a complete APP1 segment, ready for `withExifSegment`. It is the
 * same length as the original: the parts that must not travel are overwritten
 * with zeroes and the directory entry pointing at them is dropped, which leaves
 * a little dead space rather than requiring every offset in the block to be
 * recalculated. Readers find their way by the entry count, so they never see it.
 */
export function portableExif(source: ArrayBufferLike): Uint8Array | null {
  const segment = findExifSegment(new DataView(source as ArrayBuffer));
  if (!segment) return null;

  const bytes = new Uint8Array((source as ArrayBuffer).slice(segment.start, segment.end));
  const tiff = readTiff(bytes, segment.tiffStart - segment.start);
  if (!tiff) return null;

  const ifd0 = tiff.start + readOffset(tiff, tiff.start + 4);
  if (!withinBlock(tiff, ifd0, ENTRY_COUNT_BYTES)) return null;

  setUpright(tiff, ifd0);
  eraseThumbnail(tiff, ifd0);
  eraseLocation(tiff, ifd0);
  return bytes;
}

function readTiff(bytes: Uint8Array, start: number): Tiff | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (start + TIFF_HEADER_BYTES > bytes.byteLength) return null;

  const mark = view.getUint16(start, false);
  if (mark !== LITTLE_ENDIAN_MARK && mark !== BIG_ENDIAN_MARK) return null;
  const littleEndian = mark === LITTLE_ENDIAN_MARK;
  if (view.getUint16(start + 2, littleEndian) !== TIFF_MAGIC) return null;

  return { bytes, view, start, end: bytes.byteLength, littleEndian };
}

/** Every offset inside a TIFF block is a LONG counted from the block's start. */
function readOffset(tiff: Tiff, at: number): number {
  return tiff.view.getUint32(at, tiff.littleEndian);
}

function withinBlock(tiff: Tiff, at: number, length: number): boolean {
  return at >= tiff.start && length >= 0 && at + length <= tiff.end;
}

interface Entry {
  at: number;
  tag: number;
  /** Where this entry's value lives and how long it is, wherever that may be. */
  valueAt: number;
  valueBytes: number;
}

/** The entries of one directory, ignoring anything that reaches outside the block. */
function entriesOf(tiff: Tiff, ifd: number): Entry[] {
  if (!withinBlock(tiff, ifd, ENTRY_COUNT_BYTES)) return [];
  const count = tiff.view.getUint16(ifd, tiff.littleEndian);
  if (!withinBlock(tiff, ifd, ENTRY_COUNT_BYTES + count * ENTRY_BYTES + NEXT_IFD_BYTES)) return [];

  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = ifd + ENTRY_COUNT_BYTES + index * ENTRY_BYTES;
    const type = tiff.view.getUint16(at + 2, tiff.littleEndian);
    const components = readOffset(tiff, at + 4);
    const size = TYPE_BYTES[type];
    const valueBytes = size === undefined ? 0 : size * components;
    const inline = valueBytes <= INLINE_VALUE_BYTES;
    const valueAt = inline ? at + 8 : tiff.start + readOffset(tiff, at + 8);
    entries.push({ at, tag: tiff.view.getUint16(at, tiff.littleEndian), valueAt, valueBytes });
  }
  return entries;
}

function findEntry(tiff: Tiff, ifd: number, tag: number): Entry | undefined {
  return entriesOf(tiff, ifd).find((entry) => entry.tag === tag);
}

/** Zeroes a range, ignoring one that does not sit inside the block. */
function erase(tiff: Tiff, at: number, length: number): void {
  if (length > 0 && withinBlock(tiff, at, length)) tiff.bytes.fill(0, at, at + length);
}

/** Zeroes a directory: its entries, and every value stored outside them. */
function eraseIfd(tiff: Tiff, ifd: number): void {
  const entries = entriesOf(tiff, ifd);
  for (const entry of entries) {
    if (entry.valueBytes > INLINE_VALUE_BYTES) erase(tiff, entry.valueAt, entry.valueBytes);
  }
  erase(tiff, ifd, ENTRY_COUNT_BYTES + entries.length * ENTRY_BYTES + NEXT_IFD_BYTES);
}

/**
 * The pixels are upright by the time anything reads this, so the tag has to say
 * so. Written rather than removed: a reader that finds no orientation assumes 1
 * anyway, but one that finds it stated cannot be talked out of it by a stray
 * copy elsewhere in the file.
 */
function setUpright(tiff: Tiff, ifd0: number): void {
  const entry = findEntry(tiff, ifd0, ORIENTATION_TAG);
  if (entry) tiff.view.setUint16(entry.at + 8, UPRIGHT, tiff.littleEndian);
}

/**
 * Drops the second directory, which is where a camera keeps its thumbnail of
 * the picture as it was before anybody edited it.
 *
 * The image bytes go first, then the directory that described them, then the
 * pointer that led here — in that order, so a failure part way through leaves
 * less behind rather than more.
 */
function eraseThumbnail(tiff: Tiff, ifd0: number): void {
  const nextAt = nextIfdPointer(tiff, ifd0);
  if (nextAt === null) return;
  const ifd1 = tiff.start + readOffset(tiff, nextAt);
  if (ifd1 === tiff.start || !withinBlock(tiff, ifd1, ENTRY_COUNT_BYTES)) return;

  const offset = findEntry(tiff, ifd1, THUMBNAIL_OFFSET_TAG);
  const length = findEntry(tiff, ifd1, THUMBNAIL_LENGTH_TAG);
  if (offset && length) {
    erase(tiff, tiff.start + readOffset(tiff, offset.at + 8), readOffset(tiff, length.at + 8));
  }
  eraseIfd(tiff, ifd1);
  tiff.view.setUint32(nextAt, 0, tiff.littleEndian);
}

function nextIfdPointer(tiff: Tiff, ifd: number): number | null {
  if (!withinBlock(tiff, ifd, ENTRY_COUNT_BYTES)) return null;
  const count = tiff.view.getUint16(ifd, tiff.littleEndian);
  const at = ifd + ENTRY_COUNT_BYTES + count * ENTRY_BYTES;
  return withinBlock(tiff, at, NEXT_IFD_BYTES) ? at : null;
}

/**
 * Erases where the picture was taken, and then the entry that pointed at it.
 *
 * Removing only the pointer would leave the coordinates sitting in the file for
 * anyone who reads it with something other than an EXIF parser, which is not
 * what "the location is not in this file" should mean.
 *
 * The entry is dropped by sliding the ones after it down and telling the
 * directory it is one shorter. Values live at absolute offsets elsewhere in the
 * block and are not disturbed by that; the twelve bytes left at the end are dead
 * space nothing looks at, which is cheaper than rewriting every offset in the
 * block to close a gap.
 */
function eraseLocation(tiff: Tiff, ifd0: number): void {
  const entry = findEntry(tiff, ifd0, GPS_IFD_TAG);
  if (!entry) return;

  const gps = tiff.start + readOffset(tiff, entry.at + 8);
  if (gps !== tiff.start && withinBlock(tiff, gps, ENTRY_COUNT_BYTES)) eraseIfd(tiff, gps);

  const count = tiff.view.getUint16(ifd0, tiff.littleEndian);
  const entriesEnd = ifd0 + ENTRY_COUNT_BYTES + count * ENTRY_BYTES;
  const tailAt = entry.at + ENTRY_BYTES;
  const tailBytes = entriesEnd + NEXT_IFD_BYTES - tailAt;
  if (tailBytes < 0 || !withinBlock(tiff, tailAt, tailBytes)) return;

  tiff.bytes.copyWithin(entry.at, tailAt, tailAt + tailBytes);
  tiff.view.setUint16(ifd0, count - 1, tiff.littleEndian);
}
