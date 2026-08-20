import { PixenError } from "../errors/index.js";
import type { StepReporter } from "../util/progress.js";
import type { DecodeOptions, DecodeStage, ImageInput } from "./decode.js";

/**
 * Any supported input, as bytes.
 *
 * Everything the decoder can be handed either already carries its bytes or has
 * to be fetched for them, and that is a different question from how pixels come
 * out of those bytes. Keeping it here is also what makes the byte count during
 * a download a small, readable thing rather than a branch inside a decode.
 */
export async function toBlob(input: ImageInput, options: DecodeOptions = {}): Promise<Blob | null> {
  if (input instanceof Blob) return input;
  if (input instanceof ArrayBuffer) return new Blob([input]);
  if (ArrayBuffer.isView(input)) {
    return new Blob([input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer]);
  }
  if (typeof input === "string") {
    try {
      const response = await fetch(input, {
        signal: options.signal ?? null,
        credentials: options.crossOrigin ?? "same-origin",
        ...(options.headers ? { headers: options.headers } : {}),
      });
      if (!response.ok) {
        throw new PixenError("INVALID_IMAGE", `Fetching the image failed with HTTP ${response.status}`, {
          details: { status: response.status, url: input },
        });
      }
      return await readResponse(response, options.onProgress);
    } catch (cause) {
      if (cause instanceof PixenError) throw cause;
      throw new PixenError(
        "CORS_ERROR",
        `Could not fetch "${input}". Check the URL and the server's CORS headers.`,
        { cause, details: { url: input } },
      );
    }
  }
  return null;
}

/**
 * Reads a response, counting bytes when anyone is listening.
 *
 * `response.blob()` is the fast path and stays the default: streaming exists
 * only to answer "how far along is this download", so it is not paid for when
 * nothing asked. `Content-Length` describes the bytes on the wire, which for a
 * compressed response is fewer than the ones that arrive — `progressRatio`
 * clamps rather than reporting 130% of a download.
 */
async function readResponse(response: Response, onProgress?: StepReporter<DecodeStage>): Promise<Blob> {
  const body = response.body;
  if (!onProgress || !body) return response.blob();

  const declared = Number(response.headers.get("content-length"));
  const total = Number.isFinite(declared) && declared > 0 ? declared : null;
  const type = response.headers.get("content-type") ?? "";

  const reader = body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  onProgress({ stage: "fetch", loaded, total });

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as BlobPart);
    loaded += value.byteLength;
    onProgress({ stage: "fetch", loaded, total });
  }
  return new Blob(chunks, { type });
}
