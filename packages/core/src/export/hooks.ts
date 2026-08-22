import type { CanvasSurface } from "../image/canvas.js";
import type { Size } from "../geometry/types.js";
import type { EditorDocument, ImageFormat } from "../model/types.js";

/**
 * The points a host can reach into an export.
 *
 * An export is: take a document, draw it, encode it, name it. Each of those is
 * something an application eventually needs to bend — a date stamped in at
 * export time, a circular mask, a format no browser writes, a filename its
 * storage layer dictates — and every one of them is otherwise a fork.
 *
 * The pixels hook is handed the surface rather than a copy of the pixels. A
 * round trip through `ImageData` costs two full-size allocations and gives the
 * host an array to loop over; a canvas gives it `globalCompositeOperation` and
 * every drawing primitive the platform has, for nothing.
 */
export interface ExportHooks {
  /**
   * The document about to be drawn. For anything decided at export time rather
   * than stored: filling placeholder text, adding a watermark only the exported
   * copy carries.
   *
   * The format announced by `export-start` is read before this runs, so a hook
   * that changes the output format changes the file without changing the event.
   */
  document?(document: EditorDocument): EditorDocument | Promise<EditorDocument>;
  /**
   * The picture to draw from, for this export only.
   *
   * `replaceSource` on the editor swaps the picture in the document, which is
   * permanent and undoable; this swaps it for one file and leaves the document
   * exactly as it was — an optimisation pass, a format conversion, a sharpened
   * copy for print while the screen copy stays as it is.
   *
   * Return a source of any size. Its own size is measured and the scene is told
   * about it, the same way a resampled stand-in is, so a smaller or larger
   * replacement lands in the same place at a different resolution rather than
   * in the wrong place.
   *
   * Runs before `resample`, which then sees whatever this returned.
   */
  source?(source: CanvasImageSource, size: Size): CanvasImageSource | Promise<CanvasImageSource>;
  /**
   * Downscales the source before the picture is drawn from it.
   *
   * Only called when the export is much smaller than the source, and only when
   * it is set: Pixen draws straight from the source otherwise. Halving in steps
   * first is the usual advice for a large downscale, but measured on Chromium it
   * lands no closer to the true area average than one `drawImage` does, and adds
   * about half a second on a 24-megapixel photograph — so it is a seam rather
   * than a default. Reach for it with a filter of your own (Lanczos, a WASM
   * resizer, sharpening after the shrink), or with `drawResized`, which is
   * exported, if you have measured that your target engines need it.
   *
   * Return an image of `to` pixels. Returning another size is safe — the picture
   * lands in the same place either way — it simply resamples at that size.
   */
  resample?(source: CanvasImageSource, from: Size, to: Size): CanvasImageSource | Promise<CanvasImageSource>;
  /** The drawn pixels, before they are encoded. Draw onto the surface in place. */
  pixels?(surface: CanvasSurface, size: Size): void | Promise<void>;
  /** The encoded bytes. For a format the browser cannot write itself. */
  bytes?(blob: Blob, context: { format: ImageFormat; size: Size }): Blob | Promise<Blob>;
  /** The name the file goes out under. Runs after `filename` in the options. */
  filename?(suggested: string, context: { format: ImageFormat }): string;
}
