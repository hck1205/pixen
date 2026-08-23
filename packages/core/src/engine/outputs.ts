/**
 * Every way a picture leaves the editor.
 *
 * Six entry points — a file, an upload, several sizes, a canvas, raw pixels, a
 * mask — and they share more than they look like they do: the first three are
 * the same task with a different last step, and the last three are the same
 * render with a different container. Both of those shared rules used to live in
 * the middle of the editor, which is a facade and should be delegations.
 *
 * The editor keeps its methods; this is what they call.
 */
import type { ExportOptions, ExportResult } from "../export/options.js";
import { resolveOutputFormat } from "../export/output.js";
import { exportDocument } from "../export/pipeline.js";
import { renderMask, type MaskOptions } from "../export/mask.js";
import {
  renderDocumentToCanvas,
  renderDocumentToImageData,
  type PictureOptions,
} from "../export/render.js";
import { uploadExport, type UploadResponse, type UploadTarget } from "../export/upload.js";
import { exportVariants, type ExportVariant, type VariantSpec } from "../export/variants.js";
import type { CanvasSurface } from "../image/canvas.js";
import type { PixenErrorCode } from "../errors/index.js";
import type { EditorDocument } from "../model/types.js";
import type { ShapeProcessor } from "../render/preprocess.js";
import type { ResourceManager } from "../resources/manager.js";
import { tracked, type TaskAttempt, type TaskRunner } from "./tasks/index.js";

export interface OutputPorts {
  /** The document as it stands, read per call: an export is not a snapshot. */
  document(): EditorDocument;
  resources: ResourceManager;
  /** The host's shape rules, applied unless a caller named its own. */
  processors(): readonly ShapeProcessor[];
  /** The one task an export runs inside, so a cancel reaches whichever step is running. */
  task: TaskRunner<{ format: string }>;
  /** What the editor announces when a file is finished. */
  exported(result: ExportResult): void;
  /** How a failed export is reported, which is the editor's business rather than ours. */
  failure: { code: PixenErrorCode; message: string };
  assertAlive(): void;
}

export class EditorOutputs {
  #ports: OutputPorts;

  constructor(ports: OutputPorts) {
    this.#ports = ports;
  }

  /**
   * Every way out is the same task: announce a start, report the steps, end
   * once. Three entry points shared it before it had a name.
   */
  #run<T>(options: ExportOptions, work: (attempt: TaskAttempt) => Promise<T>): Promise<T> {
    this.#ports.assertAlive();
    return this.#ports.task.run(
      { format: resolveOutputFormat(this.#ports.document(), options.format) },
      { ...this.#ports.failure, signal: options.signal },
      work,
    );
  }

  /** The host's shape rules, unless the caller named its own. */
  #withProcessors<T extends { preprocess?: readonly ShapeProcessor[] }>(options: T): T {
    return options.preprocess ? options : { ...options, preprocess: this.#ports.processors() };
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    return this.#run(options, async (attempt) => {
      const result = await exportDocument(
        this.#ports.document(),
        this.#ports.resources,
        this.#withProcessors(tracked(options, attempt)),
      );
      this.#ports.exported(result);
      return result;
    });
  }

  async exportTo(target: UploadTarget, options: ExportOptions): Promise<UploadResponse> {
    return this.#run(options, async (attempt) => {
      const result = await exportDocument(
        this.#ports.document(),
        this.#ports.resources,
        this.#withProcessors(tracked(options, attempt)),
      );
      this.#ports.exported(result);
      return uploadExport(result, target, { signal: attempt.signal, onProgress: attempt.report });
    });
  }

  async variants(specs: readonly VariantSpec[], options: ExportOptions): Promise<ExportVariant[]> {
    return this.#run(options, (attempt) =>
      exportVariants(
        this.#ports.document(),
        this.#ports.resources,
        specs,
        this.#withProcessors(tracked(options, attempt)),
      ),
    );
  }

  canvas(options: PictureOptions): CanvasSurface {
    this.#ports.assertAlive();
    return renderDocumentToCanvas(this.#ports.document(), this.#ports.resources, this.#withProcessors(options));
  }

  pixels(options: PictureOptions): ImageData {
    this.#ports.assertAlive();
    return renderDocumentToImageData(this.#ports.document(), this.#ports.resources, this.#withProcessors(options));
  }

  mask(options: MaskOptions): CanvasSurface {
    this.#ports.assertAlive();
    return renderMask(this.#ports.document(), this.#ports.resources, options);
  }
}
