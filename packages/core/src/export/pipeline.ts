import { toPixenError } from "../errors/index.js";
import {
  assertDrawableSize,
  createSurface,
  releaseSurface,
  type CanvasSurface,
} from "../image/canvas.js";
import { encodeSurface, encodeWithinBudget, supportsTransparency } from "../image/encode.js";
import { withExifSegment } from "../image/jpeg.js";
import { portableExif, type MetadataPolicy } from "../image/metadata.js";
import { roundedSize } from "../geometry/rect.js";
import { resolveQuality } from "../model/defaults.js";
import { effectiveCrop } from "../model/document.js";
import type { EditorDocument, ImageFormat } from "../model/types.js";
import { renderScene } from "../render/canvas2d/index.js";
import { createScene } from "../render/scene.js";
import type { ResourceManager } from "../resources/manager.js";
import { throwIfAborted } from "../util/abort.js";
import type { StepReporter } from "../util/progress.js";
import { exportBackground, exportFilename, exportTarget, resolveOutputFormat } from "./output.js";
import type { ExportOptions, ExportResult, ExportStage } from "./options.js";
import { standIn } from "./source.js";

/** What a cancelled export calls itself, in one place so the three checks agree. */
const EXPORT = "Export";
/** The one format on both sides of a metadata copy. */
const JPEG: ImageFormat = "image/jpeg";

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
  throwIfAborted(options.signal, EXPORT);

  const hooks = options.hooks ?? {};
  // Read before anything else: the hook exists to change what is drawn, so
  // everything below has to derive from what it returned.
  const drawn = hooks.document ? await hooks.document(document) : document;

  const resource = resources.require(drawn.source.resourceId);
  const format = resolveOutputFormat(drawn, options.format);
  // The stored quality, the format's own default, or the fallback. See `resolveQuality`.
  const quality = options.quality ?? resolveQuality(format, drawn.output.quality);

  const target = exportTarget(drawn, options);
  assertDrawableSize(target, "export");
  const background = exportBackground(drawn, options, format);

  let surface: CanvasSurface | null = null;
  try {
    options.onProgress?.({ stage: "render", loaded: 0, total: null });
    surface = createSurface(target.width, target.height, supportsTransparency(format));

    const crop = effectiveCrop(drawn);
    const stand = await standIn(resource, roundedSize(crop.width, crop.height), target, hooks);
    const scene = createScene(
      { ...drawn, output: { ...drawn.output, background } },
      { source: stand, resolveResource: resources.resolve, preprocess: options.preprocess },
      { region: "crop", target },
    );
    renderScene(surface.context, scene);
    await hooks.pixels?.(surface, target);

    throwIfAborted(options.signal, EXPORT);

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
    throwIfAborted(options.signal, EXPORT);

    const suggested = exportFilename(drawn, format, options.filename);
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
