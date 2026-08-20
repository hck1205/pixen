import { PixenError, toPixenError } from "../errors/index.js";
import type { Size } from "../geometry/types.js";
import { assertDrawableSize, createSurface, releaseSurface, type CanvasSurface } from "../image/canvas.js";
import { encodeSurface, encodeWithinBudget, extensionForFormat, supportsTransparency } from "../image/encode.js";
import { withExifSegment } from "../image/jpeg.js";
import { portableExif, type MetadataPolicy } from "../image/metadata.js";
import { standInSize } from "../image/resize.js";
import { roundedSize } from "../geometry/rect.js";
import { effectiveCrop, outputSize as documentOutputSize } from "../model/document.js";
import { IMAGE_FORMATS, type EditorDocument, type ImageFormat } from "../model/types.js";
import { renderScene } from "../render/canvas2d/index.js";
import { createScene } from "../render/scene.js";
import type { ImageResource, ResourceManager } from "../resources/manager.js";
import type { StepReporter } from "../util/progress.js";
import type { ExportHooks } from "./hooks.js";

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
/** The one format on both sides of a metadata copy. */
const JPEG: ImageFormat = "image/jpeg";

/**
 * The format an export will actually use.
 *
 * Exported because "auto" is a promise the interface has to be able to keep:
 * a format picker showing *Auto* has to be able to say what auto means for this
 * picture, and a second implementation of that rule would be a second answer.
 */
export function resolveOutputFormat(document: EditorDocument, requested?: ImageFormat): ImageFormat {
  if (requested) return requested;
  if (document.output.format) return document.output.format;
  const sourceType = document.source.mimeType;
  if (sourceType && (IMAGE_FORMATS as readonly string[]).includes(sourceType)) return sourceType as ImageFormat;
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

  const hooks = options.hooks ?? {};
  // Read before anything else: the hook exists to change what is drawn, so
  // everything below has to derive from what it returned.
  const drawn = hooks.document ? await hooks.document(document) : document;

  const resource = resources.require(drawn.source.resourceId);
  const format = resolveOutputFormat(drawn, options.format);
  const quality = options.quality ?? drawn.output.quality;

  const target = resolveExportSize(drawn, options);
  assertDrawableSize(target, "export");

  const background =
    options.background !== undefined
      ? options.background
      : drawn.output.background ?? (supportsTransparency(format) ? null : "#ffffff");

  let surface: CanvasSurface | null = null;
  try {
    options.onProgress?.({ stage: "render", loaded: 0, total: null });
    surface = createSurface(target.width, target.height, supportsTransparency(format));

    const crop = effectiveCrop(drawn);
    const stand = await standIn(resource, roundedSize(crop.width, crop.height), target, hooks.resample);
    const scene = createScene(
      { ...drawn, output: { ...drawn.output, background } },
      { source: stand.source, sourceScale: stand.scale, resolveResource: resources.resolve },
      { region: "crop", target },
    );
    renderScene(surface.context, scene);
    await hooks.pixels?.(surface, target);

    if (options.signal?.aborted) throw new PixenError("ABORTED", "Export was aborted");

    const onProgress = options.onProgress;
    const encoded =
      options.maxBytes != null
        ? await encodeWithinBudget(surface.canvas, format, quality, options.maxBytes, {
            onAttempt: (attempt, steps) => onProgress?.({ stage: "encode", loaded: attempt, total: steps }),
          })
        : await encodeOnce(surface.canvas, format, quality, onProgress);

    const carried = await carryMetadata(encoded.blob, resource.blob, format, options.metadata);
    const blob = hooks.bytes ? await hooks.bytes(carried, { format, size: target }) : carried;

    // An encode in progress cannot be interrupted — no browser exposes that —
    // so a cancel arriving mid-encode is honoured at the only point it can be:
    // the result is thrown away rather than handed to a caller who said they no
    // longer wanted it.
    if (options.signal?.aborted) throw new PixenError("ABORTED", "Export was aborted");

    const suggested = buildFilename(drawn, format, options.filename);
    return {
      blob,
      width: target.width,
      height: target.height,
      format,
      quality: encoded.quality,
      bytes: blob.size,
      filename: hooks.filename ? hooks.filename(suggested, { format }) : suggested,
      sourceBytes: resource.blob?.size ?? null,
      encodeAttempts: encoded.attempts,
    };
  } catch (cause) {
    throw toPixenError(cause, "EXPORT_FAILED", "The image could not be exported");
  } finally {
    releaseSurface(surface);
  }
}

interface StandIn {
  source: CanvasImageSource;
  /** Stand-in pixels per source pixel; 1 when the source itself is drawn. */
  scale: number;
}

/**
 * The picture the export draws from — the source itself, unless a host has
 * supplied its own resampler for a large downscale.
 *
 * Pixen does not pre-shrink on its own. The received wisdom is that a single
 * `drawImage` shrinking by more than about half keeps one sample per output
 * pixel and turns fine detail into aliasing, which is why `drawResized` halves
 * in steps for the preview. Measured on Chromium, that is not true of an export:
 * halving first lands no closer to the true area average than one draw does, and
 * costs about half a second on a 24-megapixel source. So the cost is not
 * imposed — the seam is offered instead, for a host that has measured its own
 * target engines or simply wants a better filter than the browser's.
 *
 * `sourceScale` is how the scene is told, which is the same mechanism the
 * preview proxy has always used rather than a second way of saying it. It sizes
 * the box the stand-in is stretched into on its way to image space, so a host
 * that returns something other than the size it was asked for gets a slightly
 * different resampling resolution and the same picture, in the same place.
 */
async function standIn(
  resource: ImageResource,
  crop: Size,
  target: Size,
  resample: ExportHooks["resample"],
): Promise<StandIn> {
  const whole: StandIn = { source: resource.source, scale: 1 };
  if (!resample) return whole;

  const from: Size = { width: resource.width, height: resource.height };
  const to = standInSize(from, crop, target);
  if (to === null) return whole;

  return { source: await resample(resource.source, from, to), scale: to.width / from.width };
}

/**
 * The exported file with the source's own record of itself put back, when a
 * host asked for it.
 *
 * Only JPEG to JPEG: PNG has no EXIF worth the name, and the browser's WebP
 * encoder writes a container Pixen would have to learn to edit for no clear
 * gain. Anything that does not apply — the wrong format, a source with no EXIF,
 * a block too large to be a segment — leaves the file exactly as encoded, which
 * is the same thing `strip` does.
 *
 * It runs before the `bytes` hook rather than after, so a host replacing the
 * bytes outright is not handed a segment spliced into a format it no longer is.
 */
async function carryMetadata(
  encoded: Blob,
  source: Blob | null,
  format: ImageFormat,
  policy: MetadataPolicy | undefined,
): Promise<Blob> {
  if (policy !== "copy" || format !== JPEG || source === null || source.type !== JPEG) return encoded;

  const segment = portableExif(await source.arrayBuffer());
  if (!segment) return encoded;

  const withMetadata = withExifSegment(new Uint8Array(await encoded.arrayBuffer()), segment);
  return new Blob([withMetadata as BlobPart], { type: format });
}

/** The single-attempt encode, reported as the one step it is. */
async function encodeOnce(
  canvas: CanvasSurface["canvas"],
  format: ImageFormat,
  quality: number,
  onProgress: StepReporter<ExportStage> | undefined,
): Promise<{ blob: Blob; quality: number; attempts: number }> {
  onProgress?.({ stage: "encode", loaded: 0, total: 1 });
  const blob = await encodeSurface(canvas, format, quality);
  onProgress?.({ stage: "encode", loaded: 1, total: 1 });
  return { blob, quality, attempts: 1 };
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
