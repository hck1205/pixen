import { describe, expect, it } from "vitest";
import {
  applyOrientationToSize,
  orientationSwapsAxes,
  orientationTransform,
  readExifOrientation,
  type ExifOrientation,
} from "@pixen/core";

/** Builds the smallest JPEG-shaped buffer that carries an EXIF orientation tag. */
function jpegWithOrientation(orientation: number, littleEndian = true): ArrayBuffer {
  const app1Length = 8 + 8 + 2 + 12 + 4; // "Exif\0\0" + TIFF header + IFD
  const bytes = new ArrayBuffer(2 + 2 + app1Length + 2);
  const view = new DataView(bytes);
  let offset = 0;

  view.setUint16(offset, 0xffd8, false); // SOI
  offset += 2;
  view.setUint16(offset, 0xffe1, false); // APP1
  offset += 2;
  view.setUint16(offset, app1Length, false);
  offset += 2;

  view.setUint32(offset, 0x45786966, false); // "Exif"
  offset += 4;
  view.setUint16(offset, 0x0000, false); // padding
  offset += 2;

  const tiffStart = offset;
  view.setUint16(offset, littleEndian ? 0x4949 : 0x4d4d, false);
  offset += 2;
  view.setUint16(offset, 0x002a, littleEndian);
  offset += 2;
  view.setUint32(offset, 8, littleEndian); // IFD offset relative to tiffStart
  offset += 4;

  view.setUint16(tiffStart + 8, 1, littleEndian); // one entry
  const entry = tiffStart + 10;
  view.setUint16(entry, 0x0112, littleEndian); // orientation tag
  view.setUint16(entry + 2, 3, littleEndian); // SHORT
  view.setUint32(entry + 4, 1, littleEndian); // count
  view.setUint16(entry + 8, orientation, littleEndian);

  return bytes;
}

describe("readExifOrientation", () => {
  it("reads a little-endian orientation", () => {
    expect(readExifOrientation(jpegWithOrientation(6))).toBe(6);
  });

  it("reads a big-endian orientation", () => {
    expect(readExifOrientation(jpegWithOrientation(8, false))).toBe(8);
  });

  it("returns null for a non-JPEG", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(readExifOrientation(png.buffer)).toBeNull();
  });

  it("returns null for a JPEG without EXIF", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
    expect(readExifOrientation(bytes.buffer)).toBeNull();
  });

  it("returns null rather than reading past a truncated segment", () => {
    const full = new Uint8Array(jpegWithOrientation(6));
    expect(readExifOrientation(full.slice(0, 12).buffer)).toBeNull();
  });

  it("returns null for an out-of-range orientation value", () => {
    expect(readExifOrientation(jpegWithOrientation(42))).toBeNull();
  });

  it("survives an empty buffer", () => {
    expect(readExifOrientation(new ArrayBuffer(0))).toBeNull();
  });
});

describe("orientationTransform", () => {
  it("leaves orientation 1 alone", () => {
    expect(orientationTransform(1)).toEqual({ rotation: 0, flipX: false, flipY: false });
  });

  it("rotates orientation 6 a quarter turn clockwise", () => {
    const transform = orientationTransform(6);
    expect(transform.rotation).toBeCloseTo(Math.PI / 2);
    expect(transform.flipX).toBe(false);
  });

  it("mirrors the transposed orientations", () => {
    expect(orientationTransform(5).flipX).toBe(true);
    expect(orientationTransform(7).flipX).toBe(true);
  });

  it("swaps the axes for orientations 5 to 8 only", () => {
    for (const orientation of [1, 2, 3, 4] as ExifOrientation[]) {
      expect(orientationSwapsAxes(orientation)).toBe(false);
    }
    for (const orientation of [5, 6, 7, 8] as ExifOrientation[]) {
      expect(orientationSwapsAxes(orientation)).toBe(true);
    }
  });

  it("reports the upright size", () => {
    expect(applyOrientationToSize({ width: 4000, height: 3000 }, 6)).toEqual({ width: 3000, height: 4000 });
    expect(applyOrientationToSize({ width: 4000, height: 3000 }, 3)).toEqual({ width: 4000, height: 3000 });
  });
});
