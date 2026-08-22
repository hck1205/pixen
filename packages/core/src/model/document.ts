import { rectFromSize, roundedSize } from "../geometry/rect.js";
import { stageSizeFor } from "../geometry/spaces.js";
import type { Rect, Size } from "../geometry/types.js";
import { deepClone } from "../util/clone.js";
import {
  ADJUSTMENT_KEYS,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_OUTPUT,
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
    clip: null,
    aspectRatio: null,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
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
 * Pixel size of an export.
 *
 * One of `output.width` / `output.height` scales proportionally; both together
 * scale each axis independently (the caller asked for it), and neither keeps the
 * crop's own size.
 */
export function outputSize(document: EditorDocument): Size {
  const crop = effectiveCrop(document);
  const { width, height } = document.output;

  if (width != null && height != null) return roundedSize(width, height);
  if (width != null) return roundedSize(width, crop.height * (width / crop.width));
  if (height != null) return roundedSize(crop.width * (height / crop.height), height);
  return roundedSize(crop.width, crop.height);
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
    output.background === null
  );
}

