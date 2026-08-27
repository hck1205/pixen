import type { Size } from "../geometry/types.js";
import { createSurface, type CanvasSurface } from "./canvas.js";

/**
 * A picture that is not a photograph.
 *
 * Every document points at a registered bitmap, which is right — the model has
 * one kind of source and no special case for emptiness — and it left one thing
 * unreachable: starting from nothing. A poster, a diagram, a caption card, a
 * screenshot annotated onto a blank sheet all begin the same way, and the
 * honest way to reach them is to make the sheet rather than to teach the
 * document that a source might be absent.
 *
 * Transparent by default, because that is what "blank" means in a format that
 * can carry it. Exporting one to a format that cannot keeps working: the
 * opaque fallback is already what `exportBackground` does.
 */
/**
 * A sheet to start on: how big, and what colour.
 *
 * One object rather than a size and an options bag. A caller writes
 * `{ width, height, background }` in one breath, and a two-argument shape
 * accepted that quietly — the size fitted and the colour went nowhere.
 */
export interface BlankSheet extends Size {
  /** Painted over the whole sheet. Omitted leaves it transparent. */
  background?: string;
  /** What the sheet is called, for the name an export is offered under. */
  name?: string;
}

/**
 * Draws an empty picture of `size`. The caller owns the surface and releases it.
 *
 * Size is checked by `createSurface`, so a sheet larger than the platform can
 * draw is refused here rather than at the first export.
 */
export function blankPicture(size: Size, options: { background?: string } = {}): CanvasSurface {
  const surface = createSurface(size.width, size.height, options.background === undefined);
  if (options.background !== undefined) {
    surface.context.fillStyle = options.background;
    surface.context.fillRect(0, 0, surface.canvas.width, surface.canvas.height);
  }
  return surface;
}
