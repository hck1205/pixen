import type { MetadataPolicy } from "../image/metadata.js";
import type { ImageFormat } from "../model/types.js";
import type { ShapeProcessor } from "../render/preprocess.js";
import type { StepReporter } from "../util/progress.js";
import type { ExportHooks } from "./hooks.js";

/**
 * What an export is asked for, and what comes back.
 *
 * The vocabulary rather than the act: the pipeline runs against it, and the
 * decisions in `output.ts` read it to say in advance what a run would produce.
 */

/**
 * The steps of getting a file out of the editor that are worth reporting.
 *
 * `render` is a single pass over the scene and cannot be counted; `encode` can,
 * because a byte budget encodes up to a known number of times. `variant` counts
 * the files in a multi-size export — see `exportVariants` — and `upload` counts
 * bytes on the wire, which is the one step a server tells us the size of.
 */
export type ExportStage = "render" | "encode" | "variant" | "upload";

export interface ExportOptions {
  format?: ImageFormat;
  /** 0..1, only meaningful for lossy formats. */
  quality?: number;
  /** Output pixel overrides; fall back to the document's output settings. */
  width?: number | null;
  height?: number | null;
  /** Painted under the image. Required in practice when exporting alpha to JPEG. */
  background?: string | null;
  /** Re-encodes at lower quality until the result fits. */
  maxBytes?: number | null;
  /**
   * A ceiling on the pixels in the exported image. An export past it is scaled
   * to fit rather than refused, so the size in the result is the one to trust.
   *
   * For the phones whose real canvas limit is below a photograph they took
   * themselves — where the failure is a blank picture rather than an error. See
   * `docs/BROWSER-SUPPORT.md`.
   */
  maxPixels?: number | null;
  filename?: string;
  /**
   * What to do with the source's own EXIF record. `strip` by default — see
   * `METADATA_POLICIES`. Only JPEG to JPEG carries anything.
   */
  metadata?: MetadataPolicy;
  signal?: AbortSignal;
  /** Called as the picture is rendered and encoded. See `ExportStage`. */
  onProgress?: StepReporter<ExportStage>;
  /** Host steps at the points an export can be bent. See `ExportHooks`. */
  hooks?: ExportHooks;
  /** Rules over each shape before it is drawn. See `preprocessLayers`. */
  preprocess?: readonly ShapeProcessor[];
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  format: ImageFormat;
  /** The quality actually used, which may be lower than requested under `maxBytes`. */
  quality: number;
  bytes: number;
  filename: string;
  /** Byte size of the original file when known, for reporting savings. */
  sourceBytes: number | null;
  encodeAttempts: number;
}
