import { describe, expect, it } from "vitest";
import { imageWorkerBody } from "../src/image/worker/body.js";
import { isWorkerResponse, transfersFor, transfersForResponse } from "../src/image/worker/protocol.js";
import { ImageWorker } from "../src/image/worker/client.js";
import { worthDecodingOffThread } from "../src/image/decode.js";
import { worthEncodingOffThread } from "../src/image/encode.js";

describe("the worker protocol", () => {
  it("transfers the pixel buffer rather than copying it", () => {
    const pixels = new ArrayBuffer(64);
    const transfers = transfersFor({
      id: 1,
      kind: "encode",
      pixels,
      width: 4,
      height: 4,
      format: "image/jpeg",
      quality: 0.8,
    });
    expect(transfers).toEqual([pixels]);
  });

  it("has nothing to transfer for a decode request", () => {
    expect(transfersFor({ id: 1, kind: "decode", blob: new Blob() })).toEqual([]);
  });

  it("transfers the bitmap back", () => {
    const bitmap = {} as ImageBitmap;
    expect(
      transfersForResponse({ id: 1, ok: true, kind: "decode", bitmap, width: 2, height: 2 }),
    ).toEqual([bitmap]);
    expect(transfersForResponse({ id: 1, ok: false, message: "no" })).toEqual([]);
  });

  it("recognises a reply, and refuses anything else on the same channel", () => {
    expect(isWorkerResponse({ id: 1, ok: true, kind: "encode", blob: new Blob() })).toBe(true);
    expect(isWorkerResponse({ id: 1, ok: false, message: "boom" })).toBe(true);
    // A stray message from something else sharing the worker must not be
    // mistaken for a reply and resolve someone's promise.
    expect(isWorkerResponse({ id: 1, ok: true, kind: "something-else" })).toBe(false);
    expect(isWorkerResponse({ ok: true, kind: "decode" })).toBe(false);
    expect(isWorkerResponse("hello")).toBe(false);
    expect(isWorkerResponse(null)).toBe(false);
  });
});

describe("the worker body", () => {
  it("is self-contained, because only its own text is serialised", () => {
    // It ships as `(${body})()` inside a blob, so a reference to anything
    // outside itself would be undefined at run time.
    // Its own name is in the text; what must not be is anything it would have
    // to import — those become undefined once only the body crosses over.
    const source = imageWorkerBody.toString();
    for (const forbidden of ["PixenError", "transfersFor(", "isWorkerResponse", "import ", "require("]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("decodes with orientation left to Pixen, or the image turns twice", () => {
    expect(imageWorkerBody.toString()).toContain('imageOrientation: "none"');
  });
});

describe("the worker client", () => {
  it("reports the environment honestly, and degrades rather than throwing", async () => {
    // Node has no Worker or OffscreenCanvas; the client must say so and then
    // return null so callers do the work themselves.
    expect(ImageWorker.available).toBe(false);
    const worker = new ImageWorker();
    expect(worker.ready).toBe(false);
    expect(await worker.decode(new Blob())).toBeNull();
    expect(await worker.encode(new ArrayBuffer(4), 1, 1, "image/jpeg", 0.8)).toBeNull();
    worker.dispose();
  });
});

/**
 * The two thresholds the coverage page quotes — "above 512 KB in and 1 MP out".
 *
 * Both were stated in prose and checked by nothing: the browser test drives
 * `ImageWorker` directly and never goes near the decision, so flipping either
 * comparison, or dropping it, passed every suite. A number that only appears in
 * a sentence is a number that drifts away from the code.
 */
describe("what is worth moving off the main thread", () => {
  const KILOBYTE = 1024;
  const DECODE_THRESHOLD = 512 * KILOBYTE;
  const ENCODE_THRESHOLD = 1_000_000;

  it("decodes on the worker at the threshold and not below it", () => {
    expect(worthDecodingOffThread(DECODE_THRESHOLD)).toBe(true);
    expect(worthDecodingOffThread(DECODE_THRESHOLD - 1)).toBe(false);
    // A thumbnail is never worth the round trip.
    expect(worthDecodingOffThread(4 * KILOBYTE)).toBe(false);
  });

  it("encodes on the worker at the threshold and not below it", () => {
    expect(worthEncodingOffThread("image/jpeg", ENCODE_THRESHOLD)).toBe(true);
    expect(worthEncodingOffThread("image/jpeg", ENCODE_THRESHOLD - 1)).toBe(false);
  });

  it("never moves a lossless encode, however large the picture is", () => {
    // PNG encoding is comparatively cheap, and the offload costs a full canvas
    // read first — so for PNG the trade never pays, at any size.
    expect(worthEncodingOffThread("image/png", 100 * ENCODE_THRESHOLD)).toBe(false);
    expect(worthEncodingOffThread("image/webp", ENCODE_THRESHOLD)).toBe(true);
  });
});
