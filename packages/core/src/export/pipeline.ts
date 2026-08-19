import { PixenError, toPixenError } from "../errors/index.js";
import type { Size } from "../geometry/types.js";
import { assertDrawableSize, createSurface, releaseSurface, type CanvasSurface } from "../image/canvas.js";
import { encodeSurface, encodeWithinBudget, extensionForFormat, supportsTransparency } from "../image/encode.js";
import { outputSize as documentOutputSize } from "../model/document.js";
import type { EditorDocument, ImageFormat } from "../model/types.js";
import { createScene } from "../render/scene.js";
import { renderScene } from "../render/canvas2d.js";
import type { ResourceManager } from "../resources/manager.js";

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
  filename?: string;
  signal?: AbortSignal;
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

const DEFAULT_FORMAT: ImageFormat = "image/png";
const KNOWN_FORMATS: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

function resolveFormat(document: EditorDocument, requested?: ImageFormat): ImageFormat {
  if (requested) return requested;
  if (document.output.format) return document.output.format;
  const sourceType = document.source.mimeType;
  if (sourceType && KNOWN_FORMATS.includes(sourceType)) return sourceType as ImageFormat;
  return DEFAULT_FORMAT;
}

function buildFilename(document: EditorDocument, format: ImageFormat, override?: string): string {
  if (override) return override;
  const source = document.source.name ?? "image";
  const base = source.replace(/\.[^.]+$/, "") || "image";
  return `${base}-edited.${extensionForFormat(format)}`;
}

/**
 * Renders the document at full resolution and encodes it.
 *
 * Export deliberately re-renders from the original bitmap rather than reusing
 * the viewport: the preview may be a downscaled proxy, and exported pixels must
 * never inherit that.
 */
export async function exportDocument(
  document: EditorDocument,
  resources: ResourceManager,
  options: ExportOptions = {},
): Promise<ExportResult> {
  if (options.signal?.aborted) throw new PixenError("ABORTED", "Export was aborted");

  const resource = resources.require(document.source.resourceId);
  const format = resolveFormat(document, options.format);
  const quality = options.quality ?? document.output.quality;

  const target = resolveExportSize(document, options);
  assertDrawableSize(target, "export");

  const background =
    options.background !== undefined
      ? options.background
      : document.output.background ?? (supportsTransparency(format) ? null : "#ffffff");

  let surface: CanvasSurface | null = null;
  try {
    surface = createSurface(target.width, target.height, supportsTransparency(format));
    const scene = createScene(
      { ...document, output: { ...document.output, background } },
      { source: resource.source, sourceScale: 1, resolveResource: resources.resolve },
      { region: "crop", target },
    );
    renderScene(surface.context, scene);

    if (options.signal?.aborted) throw new PixenError("ABORTED", "Export was aborted");

    const encoded =
      options.maxBytes != null
        ? await encodeWithinBudget(surface.canvas, format, quality, options.maxBytes)
        : { blob: await encodeSurface(surface.canvas, format, quality), quality, attempts: 1 };

    return {
      blob: encoded.blob,
      width: target.width,
      height: target.height,
      format,
      quality: encoded.quality,
      bytes: encoded.blob.size,
      filename: buildFilename(document, format, options.filename),
      sourceBytes: resource.blob?.size ?? null,
      encodeAttempts: encoded.attempts,
    };
  } catch (cause) {
    throw toPixenError(cause, "EXPORT_FAILED", "The image could not be exported");
  } finally {
    releaseSurface(surface);
  }
}

function resolveExportSize(document: EditorDocument, options: ExportOptions = {}): Size {
  if (options.width == null && options.height == null) return documentOutputSize(document);
  return documentOutputSize({
    ...document,
    output: {
      ...document.output,
      width: options.width ?? null,
      height: options.height ?? null,
    },
  });
}

/**
 * Renders to a canvas without encoding, for hosts that want pixels — a WebGL
 * upload, an ImageData read, or their own encoder.
 */
export function renderDocumentToCanvas(
  document: EditorDocument,
  resources: ResourceManager,
  options: { target?: Size; region?: "crop" | "stage" } = {},
): CanvasSurface {
  const resource = resources.require(document.source.resourceId);
  const region = options.region ?? "crop";
  const target = options.target ?? documentOutputSize(document);
  assertDrawableSize(target, "render target");

  const surface = createSurface(target.width, target.height);
  const scene = createScene(
    document,
    { source: resource.source, sourceScale: 1, resolveResource: resources.resolve },
    { region, target },
  );
  renderScene(surface.context, scene);
  return surface;
}
