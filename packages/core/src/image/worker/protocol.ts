import type { ImageFormat } from "../../model/types.js";

/**
 * What the main thread and the image worker say to each other.
 *
 * Data rather than method calls, because the two sides are separated by
 * `postMessage` and everything crossing that boundary has to be describable.
 * Keeping the vocabulary here — rather than inside either side — is what lets
 * the framing be unit-tested without a worker at all.
 */
export type WorkerRequest =
  | { id: number; kind: "decode"; blob: Blob }
  | {
      id: number;
      kind: "encode";
      /** Raw RGBA, transferred rather than copied. */
      pixels: ArrayBuffer;
      width: number;
      height: number;
      format: ImageFormat;
      quality: number;
    };

export type WorkerResponse =
  | { id: number; ok: true; kind: "decode"; bitmap: ImageBitmap; width: number; height: number }
  | { id: number; ok: true; kind: "encode"; blob: Blob }
  | { id: number; ok: false; message: string };

/** The transferables a request carries, so nothing large is copied. */
export function transfersFor(request: WorkerRequest): Transferable[] {
  return request.kind === "encode" ? [request.pixels] : [];
}

/** The transferables a response carries. */
export function transfersForResponse(response: WorkerResponse): Transferable[] {
  return response.ok && response.kind === "decode" ? [response.bitmap] : [];
}

/** Narrows an unknown message to a response, so a stray one cannot be mistaken for a reply. */
export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "number") return false;
  if (record.ok === false) return typeof record.message === "string";
  if (record.ok !== true) return false;
  return record.kind === "decode" || record.kind === "encode";
}
