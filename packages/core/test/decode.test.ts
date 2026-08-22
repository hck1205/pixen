import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeImage } from "../src/image/decode.js";
import { toBlob } from "../src/image/bytes.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jpeg(bytes = [1, 2, 3]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

describe("beforeDecode", () => {
  it("runs before the format checks, which is the point of it", async () => {
    // A converter that hands back something the checks reject proves they read
    // its output rather than the bytes the host was originally given.
    const beforeDecode = vi.fn(async () => new Blob(["not an image"], { type: "text/plain" }));

    await expect(decodeImage(jpeg(), { beforeDecode })).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
      details: { mimeType: "text/plain" },
    });
    expect(beforeDecode).toHaveBeenCalledOnce();
  });

  it("is handed the bytes and the signal, so a converter can be called off", async () => {
    const controller = new AbortController();
    const beforeDecode = vi.fn(async (input: Blob, signal?: AbortSignal) => {
      expect(await input.text()).toHaveLength(3);
      expect(signal).toBe(controller.signal);
      controller.abort();
      return input;
    });

    await expect(decodeImage(jpeg(), { beforeDecode, signal: controller.signal })).rejects.toMatchObject({
      code: "ABORTED",
    });
  });

  it("is skipped for an input that is already decoded", async () => {
    const beforeDecode = vi.fn(async (input: Blob) => input);
    const canvas = { width: 4, height: 4 } as unknown as HTMLCanvasElement;

    await decodeImage(canvas, { beforeDecode });
    expect(beforeDecode).not.toHaveBeenCalled();
  });

  it("still refuses SVG, whatever the hook hands back", async () => {
    // Rasterising untrusted SVG can execute what is embedded in it, so this is
    // a rule rather than a default a host can opt out of.
    const beforeDecode = async () => new Blob(["<svg/>"], { type: "image/svg+xml" });
    await expect(decodeImage(jpeg(), { beforeDecode })).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
  });
});

describe("request headers", () => {
  it("sends the headers a host set, with its credentials choice", async () => {
    const fetchSpy = vi.fn(async () => new Response(new Blob(["bytes"]), { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await toBlob("https://example.test/photo.jpg", {
      headers: { "X-Tenant": "acme" },
      crossOrigin: "include",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.test/photo.jpg",
      expect.objectContaining({ headers: { "X-Tenant": "acme" }, credentials: "include" }),
    );
  });

  it("sends none when a host set none, rather than an empty object", async () => {
    const fetchSpy = vi.fn(async () => new Response(new Blob(["bytes"]), { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await toBlob("https://example.test/photo.jpg");
    expect(fetchSpy.mock.calls[0]?.[1]).not.toHaveProperty("headers");
  });
});

/**
 * The seven input types the coverage page advertises, sorted into the two
 * things `decodeImage` can do with one.
 *
 * The row claimed "File, Blob, URL string, ImageBitmap, HTMLImageElement,
 * HTMLCanvasElement, ArrayBuffer" and cited `editor.test.ts`, which never loads
 * anything — every test there starts from `editor.open(fakeResource(...))`. Four
 * of the seven were proven by nothing.
 *
 * The fork is `toBlob`: anything that carries bytes becomes a `Blob` and goes
 * through the decoder; anything already drawable is taken as it is. Which side a
 * type lands on is the whole of what "supported input" means here, and it is
 * decidable in node — the decoding itself is not, which is why it is the fork
 * that is tested rather than the pixels.
 */
describe("what counts as an input", () => {
  const drawable = (width = 8, height = 6) => ({ width, height }) as unknown as CanvasImageSource;

  it("turns everything that carries bytes into a blob", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(await toBlob(new Blob([bytes]))).toBeInstanceOf(Blob);
    expect(await toBlob(new File([bytes], "photo.jpg", { type: "image/jpeg" }))).toBeInstanceOf(Blob);
    expect(await toBlob(bytes)).toBeInstanceOf(Blob);
    expect(await toBlob(new Uint8Array([1, 2, 3]))).toBeInstanceOf(Blob);
  });

  it("takes an already-drawable source as it is", async () => {
    // `null` means "there are no bytes to fetch or read" — the caller has
    // handed over something the platform can already draw.
    for (const source of [drawable(), { width: 4, height: 4 }]) {
      expect(await toBlob(source as never)).toBeNull();
    }
  });

  it("copies only the view a typed array points at, not its whole buffer", async () => {
    // A `Uint8Array` over part of a larger buffer is the shape a host gets from
    // a parser, and sending the whole buffer would upload bytes it never meant.
    const buffer = new Uint8Array([0, 0, 1, 2, 3, 0, 0]).buffer;
    const view = new Uint8Array(buffer, 2, 3);
    const blob = await toBlob(view);
    expect(blob?.size).toBe(3);
  });

  it("reads the size off a drawable rather than guessing at one", async () => {
    const decoded = await decodeImage(drawable(320, 240));
    expect(decoded.width).toBe(320);
    expect(decoded.height).toBe(240);
    // Nothing was decoded, so there are no bytes to report and no orientation
    // to have applied.
    expect(decoded.blob).toBeNull();
    expect(decoded.orientation).toBe(1);
  });

  it("refuses a drawable with no intrinsic size, instead of a zero-pixel document", async () => {
    // An `<img>` that has not loaded reports 0×0. Opening it would make a
    // document nothing can be drawn into.
    await expect(decodeImage(drawable(0, 0))).rejects.toThrow(/no intrinsic size/);
  });
});
