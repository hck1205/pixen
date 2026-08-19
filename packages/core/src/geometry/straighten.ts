import { applyToPoint } from "./matrix.js";
import { corners } from "./rect.js";
import type { Matrix, Rect, Size } from "./types.js";

/**
 * Straightening: a small free rotation, and the crop that keeps it honest.
 *
 * Rotating by anything other than a quarter turn leaves empty corners in the
 * stage's bounding box. A straighten tool that let those corners into the export
 * would be shipping a bug, so the geometry of "the largest crop that is still
 * all image" lives here, next to the angle arithmetic it belongs with.
 */

/** Beyond 45° a straighten is a quarter turn plus a smaller straighten. */
export const MAX_STRAIGHTEN = Math.PI / 4;

const QUARTER_TURN = Math.PI / 2;

/** How many quarter turns a rotation is nearest to. */
export function nearestQuarterTurns(rotation: number): number {
  return Math.round(rotation / QUARTER_TURN);
}

/**
 * The straighten part of a rotation: what is left after the quarter turns.
 *
 * Always in (-45°, 45°], so a slider showing it never jumps when the rotation
 * crosses a quarter turn.
 */
export function straightenAngleOf(rotation: number): number {
  return rotation - nearestQuarterTurns(rotation) * QUARTER_TURN;
}

/** Folds an angle into the range a straighten may express. */
export function clampStraighten(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  return Math.min(MAX_STRAIGHTEN, Math.max(-MAX_STRAIGHTEN, radians));
}

/**
 * The largest axis-aligned size of a given aspect ratio that fits inside
 * `image` rotated by `radians`, centred on the image's own centre.
 *
 * A centred rectangle fits exactly when its half-extents, projected onto the
 * rotated image's own axes, stay inside the image's half-extents — which is two
 * inequalities rather than a search.
 */
export function inscribedSize(image: Size, radians: number, aspectRatio: number): Size {
  const ratio = aspectRatio > 0 && Number.isFinite(aspectRatio) ? aspectRatio : image.width / image.height;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  // width · cos + height · sin ≤ image.width, with height = width / ratio.
  const byWidth = image.width / (cos + sin / ratio);
  const byHeight = image.height / (sin + cos / ratio);
  const width = Math.max(1, Math.min(byWidth, byHeight));

  return { width, height: Math.max(1, width / ratio) };
}

/**
 * Whether every corner of a stage-space rect still lands on the image.
 *
 * Exact rather than approximate: the rect is mapped back into image space and
 * checked against the image's own bounds, so an off-centre crop is judged on
 * where it actually is.
 */
export function rectIsAllImage(
  rect: Rect,
  imageFromStage: Matrix,
  image: Size,
  epsilon = 0.5,
): boolean {
  return corners(rect).every((corner) => {
    const point = applyToPoint(imageFromStage, corner);
    return (
      point.x >= -epsilon &&
      point.y >= -epsilon &&
      point.x <= image.width + epsilon &&
      point.y <= image.height + epsilon
    );
  });
}

/** Centres a size on a point, as a rect. */
export function centredRect(centre: { x: number; y: number }, size: Size): Rect {
  return {
    x: centre.x - size.width / 2,
    y: centre.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}
