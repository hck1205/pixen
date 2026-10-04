import { describe, expect, it } from "vitest";
import { findExifSegment, portableExif, readExifOrientation, withExifSegment } from "@pixen/core";

/**
 * These build real EXIF blocks rather than mocking a parser, because every bug
 * this code can have is a bug about byte offsets — and a fixture that agrees
 * with the implementation about where a field lives would agree with it about
 * being wrong, too.
 */

const ORIENTATION_TAG = 0x0112;
const GPS_IFD_TAG = 0x8825;
const THUMBNAIL_OFFSET_TAG = 0x0201;
const THUMBNAIL_LENGTH_TAG = 0x0202;
const MAKE_TAG = 0x010f;
const TAKEN_TAG = 0x9003;
const SHORT = 3;
const LONG = 4;
const ASCII = 2;

interface Field {
  tag: number;
  type: number;
  count: number;
  /** Inline value, or the offset of one stored elsewhere. */
  value: number;
}

/** A directory, laid out the way TIFF says: count, entries, then a next pointer. */
function directory(fields: Field[], next = 0): Uint8Array {
  const bytes = new Uint8Array(2 + fields.length * 12 + 4);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, fields.length, false);
  fields.forEach((field, index) => {
    const at = 2 + index * 12;
    view.setUint16(at, field.tag, false);
    view.setUint16(at + 2, field.type, false);
    view.setUint32(at + 4, field.count, false);
    // A SHORT sits in the top half of its four-byte slot; everything here else
    // is a LONG, which fills it.
    if (field.type === SHORT) view.setUint16(at + 8, field.value, false);
    else view.setUint32(at + 8, field.value, false);
  });
  view.setUint32(2 + fields.length * 12, next, false);
  return bytes;
}

interface ExifShape {
  orientation?: number;
  /** Bytes stored as the GPS directory's one value, to look for afterwards. */
  location?: string;
  thumbnail?: string;
  make?: string;
  /** A field written *after* the location, so dropping that one has to slide it. */
  taken?: string;
}

/**
 * A JPEG carrying an EXIF block: big-endian, one main directory, and whichever
 * of the awkward parts the test asked for.
 */
function jpegWithExif(shape: ExifShape): ArrayBuffer {
  const parts: Uint8Array[] = [];
  const at = () => parts.reduce((total, part) => total + part.byteLength, 0);
  const text = (value: string) => new TextEncoder().encode(value);

  // Header, then IFD0, whose length depends on how many fields there are.
  const header = new Uint8Array(8);
  const headerView = new DataView(header.buffer);
  headerView.setUint16(0, 0x4d4d, false);
  headerView.setUint16(2, 0x002a, false);
  headerView.setUint32(4, 8, false);
  parts.push(header);

  const fields: Field[] = [];
  if (shape.orientation !== undefined) {
    fields.push({ tag: ORIENTATION_TAG, type: SHORT, count: 1, value: shape.orientation });
  }
  if (shape.make) fields.push({ tag: MAKE_TAG, type: ASCII, count: shape.make.length + 1, value: 0 });
  if (shape.location) fields.push({ tag: GPS_IFD_TAG, type: LONG, count: 1, value: 0 });
  if (shape.taken) fields.push({ tag: TAKEN_TAG, type: ASCII, count: shape.taken.length + 1, value: 0 });
  const ifd0 = directory(fields);
  parts.push(ifd0);

  const setEntryValue = (tag: number, value: number): void => {
    const index = fields.findIndex((field) => field.tag === tag);
    new DataView(ifd0.buffer).setUint32(2 + index * 12 + 8, value, false);
  };

  if (shape.make) {
    setEntryValue(MAKE_TAG, at());
    parts.push(text(`${shape.make}\0`));
  }
  if (shape.location) {
    setEntryValue(GPS_IFD_TAG, at());
    const gps = directory([{ tag: 1, type: ASCII, count: shape.location.length, value: 0 }]);
    parts.push(gps);
    new DataView(gps.buffer).setUint32(2 + 8, at(), false);
    parts.push(text(shape.location));
  }
  if (shape.taken) {
    setEntryValue(TAKEN_TAG, at());
    parts.push(text(`${shape.taken}\0`));
  }
  if (shape.thumbnail) {
    // IFD0's next pointer leads to the thumbnail directory.
    const ifd1At = at();
    const ifd1 = directory([
      { tag: THUMBNAIL_OFFSET_TAG, type: LONG, count: 1, value: 0 },
      { tag: THUMBNAIL_LENGTH_TAG, type: LONG, count: 1, value: shape.thumbnail.length },
    ]);
    parts.push(ifd1);
    new DataView(ifd1.buffer).setUint32(2 + 8, at(), false);
    parts.push(text(shape.thumbnail));
    new DataView(ifd0.buffer).setUint32(2 + fields.length * 12, ifd1At, false);
  }

  const tiff = new Uint8Array(at());
  let cursor = 0;
  for (const part of parts) {
    tiff.set(part, cursor);
    cursor += part.byteLength;
  }

  // Wrap the TIFF block in an APP1 segment, and that in a minimal JPEG.
  const payload = new Uint8Array(6 + tiff.byteLength);
  payload.set(text("Exif"), 0);
  payload.set(tiff, 6);

  const jpeg = new Uint8Array(2 + 4 + payload.byteLength + 4);
  const view = new DataView(jpeg.buffer);
  view.setUint16(0, 0xffd8, false); // SOI
  view.setUint16(2, 0xffe1, false); // APP1
  view.setUint16(4, 2 + payload.byteLength, false);
  jpeg.set(payload, 6);
  view.setUint16(6 + payload.byteLength, 0xffda, false); // SOS
  view.setUint16(8 + payload.byteLength, 2, false);
  return jpeg.buffer;
}

/**
 * The tags of the carried block's main directory, read independently.
 *
 * Erasing a field is only half of removing it: the directory has to end up one
 * entry shorter, or a reader walks off the end of the real entries and into
 * whatever the shift left behind. Reading the tags back is how that shows up.
 */
function tagsOf(segment: Uint8Array): number[] {
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  const tiff = 10; // 0xFFE1, the length, then "Exif\0\0".
  const ifd0 = tiff + view.getUint32(tiff + 4, false);
  const count = view.getUint16(ifd0, false);
  return Array.from({ length: count }, (_, index) => view.getUint16(ifd0 + 2 + index * 12, false));
}

function contains(bytes: Uint8Array | ArrayBuffer, needle: string): boolean {
  const haystack = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder("latin1").decode(haystack).includes(needle);
}

describe("the fixture itself", () => {
  it("builds a JPEG the reader already understands, or nothing below means anything", () => {
    const jpeg = jpegWithExif({ orientation: 6, make: "Pixen Cameras" });
    expect(findExifSegment(new DataView(jpeg))).not.toBeNull();
    expect(readExifOrientation(jpeg)).toBe(6);
    expect(contains(jpeg, "Pixen Cameras")).toBe(true);
  });
});

describe("portableExif", () => {
  it("is nothing at all when the source carries no EXIF", () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
    expect(portableExif(bare.buffer)).toBeNull();
  });

  it("keeps what the camera knew about itself", () => {
    const carried = portableExif(jpegWithExif({ orientation: 1, make: "Pixen Cameras" }))!;
    expect(carried).not.toBeNull();
    expect(contains(carried, "Pixen Cameras")).toBe(true);
  });

  it("says the pixels are upright, because they already were turned", () => {
    // Orientation 6 means "rotate a quarter turn to view". Pixen has already
    // done that to the pixels, so carrying the 6 across would turn them twice.
    const carried = portableExif(jpegWithExif({ orientation: 6, make: "Pixen Cameras" }))!;
    const rebuilt = withExifSegment(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]), carried);
    expect(readExifOrientation(rebuilt.buffer)).toBe(1);
  });

  it("erases where the picture was taken, not merely the pointer to it", () => {
    const source = jpegWithExif({ orientation: 1, make: "Pixen Cameras", location: "51.5N 0.1W" });
    expect(contains(source, "51.5N 0.1W")).toBe(true);

    const carried = portableExif(source)!;
    // A reader that ignores the directory and searches the bytes must not find
    // it either — "unreferenced" is not the same as "not in the file".
    expect(contains(carried, "51.5N 0.1W")).toBe(false);
    expect(contains(carried, "Pixen Cameras")).toBe(true);
  });

  it("erases the embedded thumbnail, which is the picture before it was edited", () => {
    const source = jpegWithExif({ orientation: 1, make: "Pixen Cameras", thumbnail: "UNREDACTED-FACE" });
    expect(contains(source, "UNREDACTED-FACE")).toBe(true);

    const carried = portableExif(source)!;
    expect(contains(carried, "UNREDACTED-FACE")).toBe(false);
    expect(contains(carried, "Pixen Cameras")).toBe(true);
  });

  it("leaves a directory a reader can still walk after dropping an entry", () => {
    // The location is in the middle of the directory, so removing it has to
    // move the entry after it as well as shorten the count.
    const source = jpegWithExif({
      orientation: 6,
      make: "Pixen Cameras",
      location: "51.5N 0.1W",
      taken: "2019:07:04 12:00:00",
      thumbnail: "OLD",
    });
    expect(tagsOf(new Uint8Array(source).subarray(2))).toEqual([
      ORIENTATION_TAG,
      MAKE_TAG,
      GPS_IFD_TAG,
      TAKEN_TAG,
    ]);

    const carried = portableExif(source)!;
    // Exactly the entries that are left — one fewer, in order, and none of the
    // bytes the dropped entry was slid over showing through as a tag of its own.
    expect(tagsOf(carried)).toEqual([ORIENTATION_TAG, MAKE_TAG, TAKEN_TAG]);
    expect(contains(carried, "2019:07:04 12:00:00")).toBe(true);

    const rebuilt = withExifSegment(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]), carried);
    expect(readExifOrientation(rebuilt.buffer)).toBe(1);
    expect(contains(rebuilt, "Pixen Cameras")).toBe(true);
  });
});

describe("withExifSegment", () => {
  // A real block, from the fixture: a hand-made stub short enough to have no
  // TIFF header in it is not an EXIF segment, and would not be found as one.
  const segment = portableExif(jpegWithExif({ orientation: 1, make: "Pixen Cameras" }))!;
  const bare = () => new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);

  it("puts the block right after the start marker, where a reader looks", () => {
    const out = withExifSegment(bare(), segment);
    expect([...out.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...out.subarray(2, 4)]).toEqual([0xff, 0xe1]);
    expect([...out.subarray(out.byteLength - 4)]).toEqual([0xff, 0xda, 0x00, 0x02]);
    expect(readExifOrientation(out.buffer)).toBe(1);
  });

  it("replaces a block already there rather than adding a second one", () => {
    const once = withExifSegment(bare(), segment);
    const twice = withExifSegment(once, segment);
    expect(twice.byteLength).toBe(once.byteLength);
    expect(readExifOrientation(twice.buffer)).toBe(1);
  });

  it("keeps everything the JPEG already had between the marker and the image", () => {
    // A comment segment ahead of the image data has to survive, and stay ahead
    // of it: splicing must not cost the file its other segments.
    const withComment = new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, 0x68, 0x69, 0xff, 0xda, 0x00, 0x02]);
    const out = withExifSegment(withComment, segment);
    expect(contains(out, "hi")).toBe(true);
    expect([...out.subarray(out.byteLength - 4)]).toEqual([0xff, 0xda, 0x00, 0x02]);
    expect(readExifOrientation(out.buffer)).toBe(1);
  });

  it("leaves bytes that are not a JPEG exactly as they were", () => {
    const notJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(withExifSegment(notJpeg, segment)).toBe(notJpeg);
  });
});
