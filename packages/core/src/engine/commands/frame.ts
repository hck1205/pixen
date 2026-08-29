/**
 * What the whole picture is: which way up, how much of it, and at what shape.
 *
 * These are the commands that change the frame rather than anything drawn in
 * it. They share one problem, which is why they are one module: the crop lives
 * in stage space, so every rotation and flip has to re-express it or it ends up
 * selecting a different part of the picture. `remapCrop` is that answer, and
 * everything here goes through it.
 */
import {
  applyAspectRatio,
  DEFAULT_MIN_CROP_SIZE,
  moveCrop,
  resizeCrop,
  type CropHandle,
} from "../../geometry/crop.js";
import { QUARTER_TURN, positiveAngle } from "../../geometry/angles.js";
import { compose } from "../../geometry/matrix.js";
import { center, constrainRect, transformBounds } from "../../geometry/rect.js";
import {
  centredRect,
  clampStraighten,
  inscribedSize,
  nearestQuarterTurns,
  rectIsAllImage,
  straightenAngleOf,
} from "../../geometry/straighten.js";
import { imageToStage, stageToImage } from "../../geometry/spaces.js";
import type { Point, Rect } from "../../geometry/types.js";
import { cropBounds, effectiveCrop, stageRect } from "../../model/document.js";
import type { SourceTransform } from "../../geometry/spaces.js";
import type { EditorDocument } from "../../model/types.js";

/**
 * Re-expresses the crop rect after the source transform changes.
 *
 * The crop lives in stage space, so a rotate would otherwise leave it pointing
 * at a different part of the picture. Mapping it through image space keeps the
 * selected content selected.
 */
export function remapCrop(
  document: EditorDocument,
  nextTransform: SourceTransform,
): { crop: Rect | null; aspectRatio: number | null } {
  if (!document.crop) {
    const aspectRatio = rotateAspectRatio(document, nextTransform);
    return { crop: null, aspectRatio };
  }

  const previousToImage = stageToImage(document.source, document.transform);
  const imageToNext = imageToStage(document.source, nextTransform);
  const mapped = transformBounds(compose(imageToNext, previousToImage), document.crop);

  const aspectRatio = rotateAspectRatio(document, nextTransform);
  const crop = constrainRect(mapped, cropBounds({ ...document, transform: nextTransform }), { aspectRatio });
  return { crop, aspectRatio };
}

/** A quarter turn swaps the axes, so a locked 16:9 becomes a locked 9:16. */
function rotateAspectRatio(document: EditorDocument, nextTransform: SourceTransform): number | null {
  if (document.aspectRatio == null) return null;
  const delta = nextTransform.rotation - document.transform.rotation;
  const swaps = Math.abs(Math.abs(Math.sin(delta)) - 1) < 1e-6;
  return swaps ? 1 / document.aspectRatio : document.aspectRatio;
}

export function setTransform(document: EditorDocument, transform: SourceTransform): EditorDocument {
  const next: SourceTransform = { ...transform, rotation: positiveAngle(transform.rotation) };
  const { crop, aspectRatio } = remapCrop(document, next);
  return { ...document, transform: next, crop, aspectRatio };
}

export function rotateBy(document: EditorDocument, radians: number): EditorDocument {
  return setTransform(document, { ...document.transform, rotation: document.transform.rotation + radians });
}

export function rotateQuarterTurns(document: EditorDocument, turns: number): EditorDocument {
  return rotateBy(document, turns * QUARTER_TURN);
}

/**
 * Sets the straighten angle — the part of the rotation that is not a quarter
 * turn — and pulls the crop in so the result is still all image.
 *
 * Absolute rather than relative, because a slider that accumulated would drift
 * away from the number it displays.
 *
 * The crop is carried as a *fraction* of the largest crop the angle allows,
 * which is what makes the slider reversible: straightening to 15° and back to 0
 * returns the framing you started with, and a tight crop stays tight instead of
 * being blown up to full frame by a one-degree nudge.
 */
export function straighten(document: EditorDocument, radians: number): EditorDocument {
  const angle = clampStraighten(radians);

  const before = effectiveCrop(document);
  const aspectRatio = document.aspectRatio ?? before.width / before.height;
  const wasAllowed = inscribedSize(document.source, straightenAngleOf(document.transform.rotation), aspectRatio);
  const fraction = Math.min(1, before.width / wasAllowed.width);

  const rotation = nearestQuarterTurns(document.transform.rotation) * QUARTER_TURN + angle;
  const rotated = setTransform(document, { ...document.transform, rotation });

  const allowed = inscribedSize(rotated.source, angle, aspectRatio);
  const size = { width: allowed.width * fraction, height: allowed.height * fraction };

  // Keep the framing where it was when the straightened image still covers it.
  // The largest allowed crop is centred by construction, so the image centre is
  // always an answer when it does not.
  const imageFromStage = stageToImage(rotated.source, rotated.transform);
  const atCropCentre = centredRect(center(effectiveCrop(rotated)), size);
  const crop = rectIsAllImage(atCropCentre, imageFromStage, rotated.source)
    ? atCropCentre
    : centredRect(center(stageRect(rotated)), size);

  return { ...rotated, crop };
}

export function flip(document: EditorDocument, axis: "x" | "y"): EditorDocument {
  const transform: SourceTransform =
    axis === "x"
      ? { ...document.transform, flipX: !document.transform.flipX }
      : { ...document.transform, flipY: !document.transform.flipY };
  return setTransform(document, transform);
}

export function setCrop(document: EditorDocument, crop: Rect | null): EditorDocument {
  if (crop === null) return { ...document, crop: null };
  return { ...document, crop: constrainRect(crop, cropBounds(document), { aspectRatio: document.aspectRatio }) };
}

export function dragCropHandle(
  document: EditorDocument,
  handle: CropHandle,
  pointer: Point,
  minSize = DEFAULT_MIN_CROP_SIZE,
): EditorDocument {
  const bounds = cropBounds(document);
  const crop = resizeCrop(effectiveCrop(document), handle, pointer, {
    bounds,
    aspectRatio: document.aspectRatio,
    minSize,
  });
  return { ...document, crop };
}

export function panCrop(document: EditorDocument, delta: Point): EditorDocument {
  return { ...document, crop: moveCrop(effectiveCrop(document), delta, cropBounds(document)) };
}

export function setAspectRatio(document: EditorDocument, aspectRatio: number | null): EditorDocument {
  const bounds = stageRect(document);
  const crop = applyAspectRatio(effectiveCrop(document), aspectRatio, bounds);
  return { ...document, aspectRatio, crop };
}
