import { fitWithinPixels } from "../geometry/rect.js";
import type { Size } from "../geometry/types.js";
import { extensionForFormat, supportsTransparency } from "../image/encode.js";
import { outputSize as documentOutputSize } from "../model/document.js";
import { IMAGE_FORMATS, type EditorDocument, type ImageFormat } from "../model/types.js";
import type { ExportOptions } from "./options.js";

/**
 * What an export will be, decided before anything is drawn.
 *
 * Four questions with one answer each — the format, the file name, the pixel
 * size and what is painted underneath — and every one of them is something the
 * interface has to be able to say in advance. A format picker showing *Auto*
 * has to name the format auto means; a size field has to show the pixels that
 * will come out; a transparency toggle has to admit when the format cannot keep
 * one. A second implementation of any of those rules would be a second answer,
 * so the pipeline and the interface both read them from here.
 */

const DEFAULT_FORMAT: ImageFormat = "image/png";

/** Painted under a picture exported to a format that has no alpha to keep. */
const OPAQUE_FALLBACK_BACKGROUND = "#ffffff";

/** The format an export will actually use. */
export function resolveOutputFormat(document: EditorDocument, requested?: ImageFormat): ImageFormat {
  if (requested) return requested;
  if (document.output.format) return document.output.format;
  const sourceType = document.source.mimeType;
  if (sourceType && (IMAGE_FORMATS as readonly string[]).includes(sourceType)) return sourceType as ImageFormat;
  return DEFAULT_FORMAT;
}

/** The name the file is offered under, from the source's own if it had one. */
export function exportFilename(document: EditorDocument, format: ImageFormat, override?: string): string {
  if (override) return override;
  const source = document.source.name ?? "image";
  const base = source.replace(/\.[^.]+$/, "") || "image";
  return `${base}-edited.${extensionForFormat(format)}`;
}

/** The pixel size of the exported image, after any ceiling on it. */
export function exportTarget(document: EditorDocument, options: ExportOptions): Size {
  const requested =
    options.width == null && options.height == null
      ? documentOutputSize(document)
      : documentOutputSize({
          ...document,
          output: { ...document.output, width: options.width ?? null, height: options.height ?? null },
        });

  return options.maxPixels == null ? requested : fitWithinPixels(requested, options.maxPixels);
}

/**
 * What is painted under the picture.
 *
 * The caller wins, including when it says `null` for none — hence the check
 * against `undefined` rather than a nullish fallback. Failing that the document
 * decides, and failing that a format with no alpha gets white rather than the
 * black that an unpainted opaque canvas would otherwise be.
 */
export function exportBackground(
  document: EditorDocument,
  options: ExportOptions,
  format: ImageFormat,
): string | null {
  if (options.background !== undefined) return options.background;
  return document.output.background ?? (supportsTransparency(format) ? null : OPAQUE_FALLBACK_BACKGROUND);
}
