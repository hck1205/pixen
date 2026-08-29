import { PixenError } from "../errors/index.js";
import type { ImageInput, DecodeOptions } from "../image/decode.js";
import { resolveSize, type ResizeIntent } from "../image/resize.js";
import { createDocument } from "../model/document.js";
import type { ImageFormat } from "../model/types.js";
import { ResourceManager } from "../resources/manager.js";
import { sourceFromResource } from "../resources/source.js";
import type { ExportResult } from "./options.js";
import { exportDocument } from "./pipeline.js";

export interface ProcessOptions extends ResizeIntent {
  format?: ImageFormat;
  quality?: number;
  /** Re-encodes at lower quality until the output fits this budget. */
  maxBytes?: number | null;
  background?: string | null;
  signal?: AbortSignal;
  decode?: DecodeOptions;
}

export interface ProcessResult extends ExportResult {
  /** Bytes saved against the input, when the input size was known. */
  savedBytes: number | null;
  /** Output bytes / input bytes. */
  compressionRatio: number | null;
}

/**
 * Editor-free image processing.
 *
 * Shrinking and re-encoding on the client is worth shipping on its own: it is
 * the part of an editor that pays for itself in upload bandwidth and server
 * processing, and plenty of applications want it without any UI at all.
 */
export async function processImage(input: ImageInput, options: ProcessOptions = {}): Promise<ProcessResult> {
  const resources = new ResourceManager();
  try {
    const resource = await resources.load(input, { ...options.decode, ...(options.signal ? { signal: options.signal } : {}) });
    const document = createDocument(sourceFromResource(resource));

    const target = resolveSize({ width: resource.width, height: resource.height }, options);
    const result = await exportDocument(
      { ...document, output: { ...document.output, width: target.width, height: target.height } },
      resources,
      {
        ...(options.format ? { format: options.format } : {}),
        ...(options.quality != null ? { quality: options.quality } : {}),
        ...(options.maxBytes != null ? { maxBytes: options.maxBytes } : {}),
        ...(options.background !== undefined ? { background: options.background } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );

    const sourceBytes = resource.blob?.size ?? null;
    return {
      ...result,
      savedBytes: sourceBytes == null ? null : sourceBytes - result.bytes,
      compressionRatio: sourceBytes == null || sourceBytes === 0 ? null : result.bytes / sourceBytes,
    };
  } finally {
    resources.disposeAll();
  }
}

export interface BatchOptions extends ProcessOptions {
  /** Images decoded at once. Kept low by default: decoding is the memory peak. */
  concurrency?: number;
  onProgress?: (progress: { completed: number; total: number; index: number }) => void;
  /** Collect failures instead of rejecting the whole batch. Default true. */
  continueOnError?: boolean;
}

export type BatchOutcome =
  | { status: "fulfilled"; index: number; result: ProcessResult }
  | { status: "rejected"; index: number; error: PixenError };

/** Processes many images with bounded concurrency, so a large drop does not exhaust memory. */
export async function processImages(inputs: ImageInput[], options: BatchOptions = {}): Promise<BatchOutcome[]> {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const continueOnError = options.continueOnError !== false;
  const outcomes: BatchOutcome[] = new Array(inputs.length);
  let cursor = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (cursor < inputs.length) {
      const index = cursor;
      cursor += 1;
      const input = inputs[index]!;
      try {
        const result = await processImage(input, options);
        outcomes[index] = { status: "fulfilled", index, result };
      } catch (cause) {
        const error =
          cause instanceof PixenError
            ? cause
            : new PixenError("EXPORT_FAILED", "Image processing failed", { cause });
        if (!continueOnError) throw error;
        outcomes[index] = { status: "rejected", index, error };
      } finally {
        completed += 1;
        options.onProgress?.({ completed, total: inputs.length, index });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return outcomes;
}
