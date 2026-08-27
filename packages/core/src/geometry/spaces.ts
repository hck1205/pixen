import { compose, invert, rotation, scaling, translation } from "./matrix.js";
import { rotatedBounds } from "./rect.js";
import type { Matrix, Point, Rect, Size } from "./types.js";

/**
 * Pixen uses four coordinate spaces. Every conversion in the product goes
 * through this module so the rules live in exactly one place.
 *
 *   image   decoded source pixels, already normalised for EXIF orientation.
 *           Layers and source-relative data are stored here, which is why a
 *           rotate or flip never has to rewrite layer coordinates.
 *
 *   stage   the image after `rotation` and the flips, origin at the top-left of
 *           the rotated bounding box. The crop rect is axis-aligned here.
 *
 *   output  the cropped region scaled to the exported pixel size.
 *
 *   view    output-independent screen space owned by the UI (pan and zoom).
 */

export interface SourceTransform {
  /** Clockwise rotation in radians. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

/** Size of the stage for an image of `imageSize` under `transform`. */
export function stageSizeFor(imageSize: Size, transform: SourceTransform): Size {
  return rotatedBounds(imageSize, transform.rotation);
}

/** image -> stage */
export function imageToStage(imageSize: Size, transform: SourceTransform): Matrix {
  const stage = stageSizeFor(imageSize, transform);
  return compose(
    translation(stage.width / 2, stage.height / 2),
    rotation(transform.rotation),
    scaling(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1),
    translation(-imageSize.width / 2, -imageSize.height / 2),
  );
}

/** stage -> image */
export function stageToImage(imageSize: Size, transform: SourceTransform): Matrix {
  return invert(imageToStage(imageSize, transform));
}

/** stage -> output, for a crop region rendered at `outputSize`. */
export function stageToOutput(crop: Rect, outputSize: Size): Matrix {
  return compose(
    scaling(outputSize.width / crop.width, outputSize.height / crop.height),
    translation(-crop.x, -crop.y),
  );
}

/**
 * output -> stage, for a layer positioned against the exported frame.
 *
 * The inverse of `stageToOutput`, written out rather than inverted: a layer in
 * output space is measured in the exported image's own pixels from its own
 * top-left, so this is the scale that turns those into stage units and the
 * offset that puts them where the crop is.
 */
export function outputToStage(crop: Rect, outputSize: Size): Matrix {
  return compose(
    translation(crop.x, crop.y),
    scaling(crop.width / outputSize.width, crop.height / outputSize.height),
  );
}

/** image -> output, the matrix the export pipeline draws the source with. */
export function imageToOutput(
  imageSize: Size,
  transform: SourceTransform,
  crop: Rect,
  outputSize: Size,
): Matrix {
  return compose(stageToOutput(crop, outputSize), imageToStage(imageSize, transform));
}

/** view matrix for a stage of `stage` shown inside `viewport` at `zoom`, panned by `pan`. */
export function stageToView(stage: Size, viewport: Size, zoom: number, pan: Point): Matrix {
  return compose(
    translation(viewport.width / 2 + pan.x, viewport.height / 2 + pan.y),
    scaling(zoom),
    translation(-stage.width / 2, -stage.height / 2),
  );
}

/** The zoom that makes `stage` fit inside `viewport` with `padding` px of margin. */
export function zoomToFit(stage: Size, viewport: Size, padding = 0): number {
  const width = Math.max(1, viewport.width - padding * 2);
  const height = Math.max(1, viewport.height - padding * 2);
  return Math.min(width / stage.width, height / stage.height);
}
