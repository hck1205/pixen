import { rectFromSize, roundedSize } from "../geometry/rect.js";
import { stageSizeFor } from "../geometry/spaces.js";
import type { Rect, Size } from "../geometry/types.js";
import { deepClone } from "../util/clone.js";
import {
  ADJUSTMENT_KEYS,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_OUTPUT,
  DEFAULT_CROP_WITHIN_IMAGE,
  SCHEMA_VERSION,
  type EditorDocument,
  type SourceDescriptor,
} from "./types.js";

export function createDocument(source: SourceDescriptor): EditorDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    source: { ...source },
    transform: { rotation: 0, flipX: false, flipY: false },
    crop: null,
    cropWithinImage: DEFAULT_CROP_WITHIN_IMAGE,
    clip: null,
    aspectRatio: null,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    colourMatrix: null,
    frame: null,
    layers: [],
    output: { ...DEFAULT_OUTPUT },
    meta: {},
  };
}

export function cloneDocument(document: EditorDocument): EditorDocument {
  return deepClone(document);
}

/** Size of the stage (image after rotation and flips). */
export function stageSize(document: EditorDocument): Size {
  return stageSizeFor(document.source, document.transform);
}

export function stageRect(document: EditorDocument): Rect {
  return rectFromSize(stageSize(document));
}

/** The crop actually in effect — the explicit rect, or the whole stage. */
export function effectiveCrop(document: EditorDocument): Rect {
  return document.crop ?? stageRect(document);
}

/**
 * How much room there is beyond the picture, as a multiple of its own size.
 *
 * A crop allowed outside the image still needs an outside to be inside of:
 * without a limit a handle could be dragged to the horizon, and the export
 * would try to allocate it. One picture's worth of room on every side is enough
 * for the cases this exists for — squaring a panorama, keeping the corners of a
 * rotated photograph — and small enough that the result is still a picture.
 */
export const CROP_OUTSIDE_ROOM = 1;

/**
 * The rectangle a crop may occupy.
 *
 * The picture itself, or the picture with room around it when the document
 * says the crop need not stay inside. One function because four callers used to
 * write `stageRect(document)` and would each have had to learn the new rule.
 */
export function cropBounds(document: EditorDocument): Rect {
  const stage = stageRect(document);
  if (document.cropWithinImage) return stage;
  const room = { x: stage.width * CROP_OUTSIDE_ROOM, y: stage.height * CROP_OUTSIDE_ROOM };
  return {
    x: stage.x - room.x,
    y: stage.y - room.y,
    width: stage.width + room.x * 2,
    height: stage.height + room.y * 2,
  };
}

/**
 * Pixel size of an export.
 *
 * One of `output.width` / `output.height` scales proportionally; both together
 * scale each axis independently (the caller asked for it), and neither keeps the
 * crop's own size.
 */
/**
 * The size a file would come out at.
 *
 * A target larger than the cropped picture only enlarges when the document says
 * to. Without that clause the same request produced two answers: `resolveSize`,
 * which the batch and variant paths use, has refused to enlarge since it was
 * written, while this multiplied whatever the panel typed in — so a 1600-pixel
 * photograph asked for 4000 came out at 4000 one way and 1600 the other.
 */
export function outputSize(document: EditorDocument): Size {
  const crop = effectiveCrop(document);
  const { width, height, upscale } = document.output;

  const asked =
    width != null && height != null
      ? { width, height }
      : width != null
        ? { width, height: crop.height * (width / crop.width) }
        : height != null
          ? { width: crop.width * (height / crop.height), height }
          : crop;

  if (upscale) return roundedSize(asked.width, asked.height);

  // Shrink the whole box by however much it overshoots, so a target that is
  // larger on one axis only keeps the ratio it was asked for.
  const overshoot = Math.max(asked.width / crop.width, asked.height / crop.height, 1);
  return roundedSize(asked.width / overshoot, asked.height / overshoot);
}



/**
 * True when the document would export the source unchanged.
 *
 * What disables the Reset button, which is why every edit has to count. The
 * adjustments are derived from `ADJUSTMENT_KEYS` rather than listed: three of
 * the nine were named here and the other six were not, so a picture with only a
 * vignette, or only a grayscale, reported as untouched and offered no way back
 * from the chrome. `ADJUSTMENT_KEYS` exists so that a new adjustment reaches
 * everything that iterates it; this was the one place that opted out.
 *
 * The frame, the clip and a chosen output format are edits too, and were
 * missing for the same reason — nothing here changed when they were added.
 */
export function isPristine(document: EditorDocument): boolean {
  const { transform, adjustments, output } = document;
  return (
    document.crop === null &&
    document.clip === null &&
    document.frame === null &&
    document.layers.length === 0 &&
    document.aspectRatio === null &&
    transform.rotation === 0 &&
    !transform.flipX &&
    !transform.flipY &&
    ADJUSTMENT_KEYS.every((key) => adjustments[key] === DEFAULT_ADJUSTMENTS[key]) &&
    output.width === null &&
    output.height === null &&
    output.format === null &&
    output.background === null &&
    !output.upscale
  );
}

