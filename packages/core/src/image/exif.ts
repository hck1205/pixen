import { QUARTER_TURN } from "../geometry/angles.js";
import { findExifSegment } from "./jpeg.js";
import { findEntry, firstDirectory, readShort, readTiffBlock } from "./tiff.js";
import type { SourceTransform } from "../geometry/spaces.js";
import type { Size } from "../geometry/types.js";

/** TIFF orientation values as stored in EXIF tag 0x0112. */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const ORIENTATION_TAG = 0x0112;
const FIRST_ORIENTATION = 1;
const LAST_ORIENTATION = 8;

/**
 * Reads the EXIF orientation from a JPEG byte range.
 *
 * Returns `null` when the bytes are not a JPEG, carry no EXIF block, or the
 * orientation tag is absent or nonsense — all of which mean "treat as
 * orientation 1". Walking the directory is `tiff.ts`; what the tag means is
 * here.
 */
export function readExifOrientation(buffer: ArrayBufferLike): ExifOrientation | null {
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const segment = findExifSegment(new DataView(buffer as ArrayBuffer));
  if (!segment) return null;

  const block = readTiffBlock(bytes, segment.tiffStart, segment.end);
  const directory = block && firstDirectory(block);
  if (!block || directory === null) return null;

  const entry = findEntry(block, directory, ORIENTATION_TAG);
  if (!entry) return null;

  const value = readShort(block, entry.valueAt);
  return value >= FIRST_ORIENTATION && value <= LAST_ORIENTATION ? (value as ExifOrientation) : null;
}

/** The transform that brings an image stored with `orientation` upright. */
export function orientationTransform(orientation: ExifOrientation): SourceTransform {
  switch (orientation) {
    case 1:
      return { rotation: 0, flipX: false, flipY: false };
    case 2:
      return { rotation: 0, flipX: true, flipY: false };
    case 3:
      return { rotation: Math.PI, flipX: false, flipY: false };
    case 4:
      return { rotation: 0, flipX: false, flipY: true };
    case 5:
      return { rotation: QUARTER_TURN, flipX: true, flipY: false };
    case 6:
      return { rotation: QUARTER_TURN, flipX: false, flipY: false };
    case 7:
      return { rotation: -QUARTER_TURN, flipX: true, flipY: false };
    case 8:
      return { rotation: -QUARTER_TURN, flipX: false, flipY: false };
  }
}

/** True when the orientation swaps width and height. */
export function orientationSwapsAxes(orientation: ExifOrientation): boolean {
  return orientation >= 5;
}

export function applyOrientationToSize(size: Size, orientation: ExifOrientation): Size {
  return orientationSwapsAxes(orientation)
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}
