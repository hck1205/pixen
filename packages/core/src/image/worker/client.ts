import { PixenError } from "../../errors/index.js";
import type { ImageFormat } from "../../model/types.js";
import { imageWorkerBody } from "./body.js";
import { isWorkerResponse, transfersFor, type WorkerRequest, type WorkerResponse } from "./protocol.js";

/**
 * Decoding and encoding on a worker thread.
 *
 * Both are the expensive parts of editing a large photograph, and both block
 * everything when they run on the main thread: a 48-megapixel JPEG takes
 * hundreds of milliseconds to decode, during which a drag stutters.
 *
 * Every path here degrades rather than fails. A browser without workers or
 * `OffscreenCanvas`, or a page whose Content-Security-Policy forbids blob
 * workers, simply does the work on the main thread as before — which is why
 * `isSupported` is a question about capability *and* about permission, and why
 * the answer is discovered by trying rather than by sniffing.
 */
export interface ImageWorkerOptions {
  /** How long a single request may take before it is abandoned. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

interface Pending {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ImageWorker {
  #worker: Worker | null = null;
  #url: string | null = null;
  #pending = new Map<number, Pending>();
  #nextId = 1;
  #timeoutMs: number;
  /** Null until the first attempt; false once the environment has said no. */
  #usable: boolean | null = null;

  constructor(options: ImageWorkerOptions = {}) {
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Whether this environment has the pieces a worker would need. */
  static get available(): boolean {
    return (
      typeof Worker !== "undefined" &&
      typeof Blob !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof createImageBitmap === "function"
    );
  }

  /** True once a worker has actually started; false once one has failed to. */
  get ready(): boolean {
    return this.#worker !== null;
  }

  /**
   * Decodes a blob off the main thread.
   *
   * Returns null when the work could not be handed off, so the caller does it
   * itself rather than the image failing to load.
   */
  async decode(blob: Blob): Promise<{ bitmap: ImageBitmap; width: number; height: number } | null> {
    const response = await this.#send({ id: this.#nextId++, kind: "decode", blob });
    if (!response || !response.ok || response.kind !== "decode") return null;
    return { bitmap: response.bitmap, width: response.width, height: response.height };
  }

  /**
   * Encodes raw RGBA off the main thread. The buffer is transferred, so the
   * caller must not use it afterwards.
   */
  async encode(
    pixels: ArrayBuffer,
    width: number,
    height: number,
    format: ImageFormat,
    quality: number,
  ): Promise<Blob | null> {
    const response = await this.#send({
      id: this.#nextId++,
      kind: "encode",
      pixels,
      width,
      height,
      format,
      quality,
    });
    if (!response || !response.ok || response.kind !== "encode") return null;
    return response.blob;
  }

  async #send(request: WorkerRequest): Promise<WorkerResponse | null> {
    const worker = this.#ensureWorker();
    if (!worker) return null;

    return await new Promise<WorkerResponse | null>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(request.id);
        // A worker that has stopped answering is worse than no worker; drop it
        // and let the caller fall back on the main thread.
        this.#teardown();
        resolve(null);
      }, this.#timeoutMs);

      this.#pending.set(request.id, {
        resolve: (response) => resolve(response),
        reject: () => resolve(null),
        timer,
      });

      try {
        worker.postMessage(request, transfersFor(request));
      } catch {
        clearTimeout(timer);
        this.#pending.delete(request.id);
        resolve(null);
      }
    });
  }

  #ensureWorker(): Worker | null {
    if (this.#worker) return this.#worker;
    if (this.#usable === false || !ImageWorker.available) return null;

    try {
      const source = `(${imageWorkerBody.toString()})()`;
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const worker = new Worker(url);
      worker.addEventListener("message", this.#onMessage);
      worker.addEventListener("error", this.#onError);
      this.#worker = worker;
      this.#url = url;
      this.#usable = true;
      return worker;
    } catch {
      // Most often a Content-Security-Policy that forbids blob: workers.
      this.#usable = false;
      return null;
    }
  }

  #onMessage = (event: MessageEvent): void => {
    if (!isWorkerResponse(event.data)) return;
    const pending = this.#pending.get(event.data.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(event.data.id);
    pending.resolve(event.data);
  };

  #onError = (): void => {
    // A worker that failed to start will fail again; stop asking it to.
    this.#usable = false;
    this.#teardown();
  };

  #teardown(): void {
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(new PixenError("ABORTED", "The image worker stopped"));
    }
    this.#pending.clear();
    this.#worker?.removeEventListener("message", this.#onMessage);
    this.#worker?.removeEventListener("error", this.#onError);
    this.#worker?.terminate();
    this.#worker = null;
    if (this.#url) URL.revokeObjectURL(this.#url);
    this.#url = null;
  }

  dispose(): void {
    this.#teardown();
    this.#usable = null;
  }
}

/**
 * The process-wide worker.
 *
 * One thread serves every editor on the page: the work is serialised anyway,
 * and a worker per editor would cost a thread per editor for no gain.
 */
let shared: ImageWorker | null = null;

export function imageWorker(): ImageWorker {
  shared ??= new ImageWorker();
  return shared;
}

/** Releases the shared worker. Tests use it; hosts rarely need to. */
export function disposeImageWorker(): void {
  shared?.dispose();
  shared = null;
}
