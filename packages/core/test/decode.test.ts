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
