import { PixenError } from "../errors/index.js";
import type { StepReporter } from "../util/progress.js";
import type { ExportResult, ExportStage } from "./pipeline.js";

/**
 * Handing the finished file to a server, with a progress bar that means it.
 *
 * Over `XMLHttpRequest` rather than `fetch`, for one reason: `fetch` cannot
 * report how much of a request body has gone out. Streaming request bodies
 * would answer it, and are behind a duplex flag that Safari does not implement.
 * An upload is the longest, least predictable part of a save, and a spinner
 * there is the difference between "it is working" and "it is nearly done" — so
 * this uses the older API that can actually say.
 */
export type UploadField = [name: string, value: string | Blob, filename?: string];

export interface UploadTarget {
  url: string;
  /** Defaults to POST. */
  method?: string;
  headers?: Record<string, string>;
  /** `include` sends cookies cross-origin; anything else does not. */
  credentials?: RequestCredentials;
  /** The multipart fields. Defaults to the file alone, under `file`. */
  fields?(result: ExportResult): UploadField[];
}

export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: StepReporter<ExportStage>;
}

export interface UploadResponse {
  status: number;
  /** The body as text. Parsing it is the caller's business, not ours. */
  body: string;
}

const DEFAULT_METHOD = "POST";
/** The field an upload uses when the target does not name one. */
const FILE_FIELD = "file";
/** Below this a response is a success; at or above it, a failure. */
const HTTP_ERROR = 400;

/**
 * What actually goes on the wire.
 *
 * A separate function because it is the only part of an upload that is a
 * decision rather than a network call, and because "did my extra field arrive
 * under the right name" is a question worth answering without a server.
 */
export function uploadFields(result: ExportResult, target: UploadTarget): UploadField[] {
  if (!target.fields) return [[FILE_FIELD, result.blob, result.filename]];
  // The file keeps its name unless the target gave one: a multipart part with
  // no filename is a text field to most servers, and the upload silently loses
  // its extension.
  return target.fields(result).map(([name, value, filename]) =>
    typeof value === "string" ? [name, value] : [name, value, filename ?? result.filename],
  );
}

function formDataFor(result: ExportResult, target: UploadTarget): FormData {
  const body = new FormData();
  for (const [name, value, filename] of uploadFields(result, target)) {
    if (typeof value === "string") body.append(name, value);
    else body.append(name, value, filename);
  }
  return body;
}

export function uploadExport(
  result: ExportResult,
  target: UploadTarget,
  options: UploadOptions = {},
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    // Cancellation first: an upload nobody wants any more was not refused by
    // the environment, whatever the environment can or cannot do.
    if (options.signal?.aborted) {
      reject(new PixenError("ABORTED", "The upload was aborted"));
      return;
    }
    if (typeof XMLHttpRequest === "undefined") {
      reject(new PixenError("UPLOAD_FAILED", "This environment has no XMLHttpRequest to upload with"));
      return;
    }

    const request = new XMLHttpRequest();
    request.open(target.method ?? DEFAULT_METHOD, target.url);
    request.withCredentials = target.credentials === "include";
    for (const [name, value] of Object.entries(target.headers ?? {})) request.setRequestHeader(name, value);

    const stop = () => request.abort();
    options.signal?.addEventListener("abort", stop, { once: true });
    const settle = <T>(finish: (value: T) => void, value: T) => {
      options.signal?.removeEventListener("abort", stop);
      finish(value);
    };

    request.upload.onprogress = (event) => {
      // `lengthComputable` is the platform saying the same thing our reports do:
      // either there is a total or there honestly is not one.
      options.onProgress?.({ stage: "upload", loaded: event.loaded, total: event.lengthComputable ? event.total : null });
    };
    request.onload = () => {
      if (request.status >= HTTP_ERROR) {
        settle(reject, new PixenError("UPLOAD_FAILED", `The upload was refused with HTTP ${request.status}`, {
          details: { status: request.status, url: target.url },
        }));
        return;
      }
      settle(resolve, { status: request.status, body: request.responseText });
    };
    request.onerror = () =>
      settle(reject, new PixenError("UPLOAD_FAILED", "The upload could not reach the server", {
        details: { url: target.url },
      }));
    request.ontimeout = () =>
      settle(reject, new PixenError("UPLOAD_FAILED", "The upload timed out", { details: { url: target.url } }));
    request.onabort = () => settle(reject, new PixenError("ABORTED", "The upload was aborted"));

    // Announced before the first byte, like every other stage: an upload that
    // has started but not yet been measured is still something to show.
    options.onProgress?.({ stage: "upload", loaded: 0, total: null });
    request.send(formDataFor(result, target));
  });
}
