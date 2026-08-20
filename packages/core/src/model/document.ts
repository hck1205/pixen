import { rectFromSize, roundedSize } from "../geometry/rect.js";
import { stageSizeFor } from "../geometry/spaces.js";
import type { Rect, Size } from "../geometry/types.js";
import { deepClone } from "../util/clone.js";
import { createId } from "../util/id.js";
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_OUTPUT,
  SCHEMA_VERSION,
  type EditorDocument,
  type EditorLayer,
  type LayerType,
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



/** True when the document would export the source unchanged. */
export function isPristine(document: EditorDocument): boolean {
  const { transform, adjustments, output } = document;
  return (
    document.crop === null &&
    document.layers.length === 0 &&
    transform.rotation === 0 &&
    !transform.flipX &&
    !transform.flipY &&
    adjustments.brightness === 0 &&
    adjustments.contrast === 0 &&
    adjustments.saturation === 0 &&
    output.width === null &&
    output.height === null
  );
}

