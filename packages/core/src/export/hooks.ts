import type { CanvasSurface } from "../image/canvas.js";
import type { Size } from "../geometry/types.js";
import type { EditorDocument, ImageFormat } from "../model/types.js";

/**
 * The four points a host can reach into an export.
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
  /** The drawn pixels, before they are encoded. Draw onto the surface in place. */
  pixels?(surface: CanvasSurface, size: Size): void | Promise<void>;
  /** The encoded bytes. For a format the browser cannot write itself. */
  bytes?(blob: Blob, context: { format: ImageFormat; size: Size }): Blob | Promise<Blob>;
  /** The name the file goes out under. Runs after `filename` in the options. */
  filename?(suggested: string, context: { format: ImageFormat }): string;
}
