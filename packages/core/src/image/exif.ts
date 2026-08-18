import type { Size } from "../geometry/types.js";

/** TIFF orientation values as stored in EXIF tag 0x0112. */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface OrientationTransform {
  /** Clockwise rotation in radians. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

const JPEG_SOI = 0xffd8;
const APP1 = 0xffe1;
const SOS = 0xffda;
const EXIF_HEADER = 0x45786966; // "Exif"
const ORIENTATION_TAG = 0x0112;

/**
 * Reads the EXIF orientation from a JPEG byte range.
 *
 * Returns `null` when the bytes are not a JPEG, carry no EXIF block, or the
 * orientation tag is absent — all of which mean "treat as orientation 1".
 * The parser walks segment headers only and never trusts a length field far
 * enough to read outside the buffer.
 */
export function readExifOrientation(buffer: ArrayBufferLike): ExifOrientation | null {
  const view = new DataView(buffer as ArrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== JPEG_SOI) return null;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    if ((marker & 0xff00) !== 0xff00) return null; // desynchronised, give up
    if (marker === SOS) return null; // image data starts, no EXIF found

    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > view.byteLength) return null;

    if (marker === APP1 && length >= 14 && view.getUint32(offset + 4, false) === EXIF_HEADER) {
      return readOrientationFromTiff(view, offset + 10, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return null;
}

function readOrientationFromTiff(view: DataView, tiffStart: number, end: number): ExifOrientation | null {
  if (tiffStart + 8 > end) return null;

  const byteOrder = view.getUint16(tiffStart, false);
  const littleEndian = byteOrder === 0x4949;
  if (!littleEndian && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) return null;

  const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > end) return null;

  const entryCount = view.getUint16(ifdStart, littleEndian);
  for (let i = 0; i < entryCount; i += 1) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, littleEndian) === ORIENTATION_TAG) {
      const value = view.getUint16(entry + 8, littleEndian);
      return value >= 1 && value <= 8 ? (value as ExifOrientation) : null;
    }
  }
  return null;
}

/** The transform that brings an image stored with `orientation` upright. */
export function orientationTransform(orientation: ExifOrientation): OrientationTransform {
  const quarter = Math.PI / 2;
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
      return { rotation: quarter, flipX: true, flipY: false };
    case 6:
      return { rotation: quarter, flipX: false, flipY: false };
    case 7:
      return { rotation: -quarter, flipX: true, flipY: false };
    case 8:
      return { rotation: -quarter, flipX: false, flipY: false };
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
