/**
 * The JPEG container, as far as Pixen needs to know it.
 *
 * A JPEG is a chain of segments: a two-byte marker, a two-byte length, then
 * that many bytes. Two questions are asked of that structure — where is the
 * Exif block, and how do I put one back — and both are about the envelope
 * rather than about what is inside it. The TIFF directory inside the Exif block
 * is a different subject and lives in `exif.ts` and `metadata.ts`.
 *
 * Nothing here trusts a length field far enough to read outside the buffer: the
 * bytes come from a file a stranger may have written.
 */

const SOI = 0xffd8;
const APP1 = 0xffe1;
/** Image data starts here; every segment worth reading is already behind us. */
const SOS = 0xffda;
/** "Exif" — the four bytes that distinguish an Exif APP1 from an XMP one. */
const EXIF_HEADER = 0x45786966;

/** Marker, length, "Exif\0\0": the fixed part before the TIFF header. */
const EXIF_PREFIX_BYTES = 10;
/** The shortest APP1 that could carry a TIFF header worth looking at. */
const MIN_EXIF_LENGTH = 14;
const MARKER_BYTES = 2;
const LENGTH_BYTES = 2;
/** 0xFFFF minus the length field's own two bytes. */
const MAX_SEGMENT_PAYLOAD = 0xffff - LENGTH_BYTES;

export interface ExifSegment {
  /** Offset of the 0xFFE1 marker. */
  start: number;
  /** One past the segment's last byte. */
  end: number;
  /** Offset of the TIFF header, which is where `exif.ts` starts reading. */
  tiffStart: number;
}

function isJpeg(view: DataView): boolean {
  return view.byteLength >= MARKER_BYTES && view.getUint16(0, false) === SOI;
}

/**
 * Walks the segment chain to the Exif block, or `null` if there is not one.
 *
 * Markers that carry no length — the restart markers, and `0xFF01` — are not
 * handled, because none of them can appear before `SOS` in a file that has an
 * Exif block to find. A desynchronised chain gives up rather than guessing.
 */
export function findExifSegment(view: DataView): ExifSegment | null {
  if (!isJpeg(view)) return null;

  let offset = MARKER_BYTES;
  while (offset + MARKER_BYTES + LENGTH_BYTES <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    if ((marker & 0xff00) !== 0xff00) return null;
    if (marker === SOS) return null;

    const length = view.getUint16(offset + MARKER_BYTES, false);
    const end = offset + MARKER_BYTES + length;
    if (length < LENGTH_BYTES || end > view.byteLength) return null;

    if (
      marker === APP1 &&
      length >= MIN_EXIF_LENGTH &&
      view.getUint32(offset + MARKER_BYTES + LENGTH_BYTES, false) === EXIF_HEADER
    ) {
      return { start: offset, end, tiffStart: offset + EXIF_PREFIX_BYTES };
    }
    offset = end;
  }
  return null;
}

/**
 * The same JPEG with `segment` as its Exif block.
 *
 * An Exif APP1 belongs immediately after the start-of-image marker, so that is
 * where it goes; any block already there is replaced rather than joined, since
 * two Exif blocks is a file that different readers disagree about.
 *
 * Returns the bytes unchanged when they are not a JPEG, or when the segment
 * would not fit in a segment length — a two-byte field, so an Exif block near
 * 64 KB (a large thumbnail, usually) simply does not travel.
 */
export function withExifSegment(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  if (!isJpeg(view)) return jpeg;
  if (segment.byteLength - MARKER_BYTES - LENGTH_BYTES > MAX_SEGMENT_PAYLOAD) return jpeg;

  const existing = findExifSegment(view);
  const bodyStart = existing ? existing.end : MARKER_BYTES;
  const head = existing ? jpeg.subarray(MARKER_BYTES, existing.start) : new Uint8Array(0);

  const out = new Uint8Array(MARKER_BYTES + segment.byteLength + head.byteLength + (jpeg.byteLength - bodyStart));
  let at = 0;
  out.set(jpeg.subarray(0, MARKER_BYTES), at);
  at += MARKER_BYTES;
  out.set(segment, at);
  at += segment.byteLength;
  out.set(head, at);
  at += head.byteLength;
  out.set(jpeg.subarray(bodyStart), at);
  return out;
}
