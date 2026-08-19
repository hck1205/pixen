import {
  applyAspectRatio,
  DEFAULT_MIN_CROP_SIZE,
  moveCrop,
  resizeCrop,
  type CropHandle,
} from "../geometry/crop.js";
import { QUARTER_TURN, positiveAngle } from "../geometry/angles.js";
import { compose, invert } from "../geometry/matrix.js";
import { center, clampInside, constrainRect, transformBounds } from "../geometry/rect.js";
import {
  centredRect,
  clampStraighten,
  inscribedSize,
  nearestQuarterTurns,
  rectIsAllImage,
  straightenAngleOf,
} from "../geometry/straighten.js";
import { imageToStage } from "../geometry/spaces.js";
import type { Point, Rect } from "../geometry/types.js";
import { effectiveCrop, stageRect } from "../model/document.js";
import { clampAdjustments } from "../model/adjustments.js";
import { DEFAULT_FRAME, MAX_FRAME_WIDTH, MIN_FRAME_WIDTH } from "../model/defaults.js";
import { layerBounds, translateLayer } from "../model/layers.js";
import { resizeLayer, rotateLayer, type LayerHandle } from "../model/transform.js";
import { DEFAULT_ADJUSTMENTS } from "../model/types.js";
import type {
  Adjustments,
  DocumentTransform,
  EditorDocument,
  EditorLayer,
  FrameSettings,
  OutputSettings,
} from "../model/types.js";

/**
 * Every document mutation lives here as a pure function.
 *
 * The engine, the headless API and the tests all call the same functions, so
 * "what does rotate do to a crop" has exactly one answer in the codebase.
 */

/**
 * Re-expresses the crop rect after the source transform changes.
 *
 * The crop lives in stage space, so a rotate would otherwise leave it pointing
 * at a different part of the picture. Mapping it through image space keeps the
 * selected content selected.
 */
export function remapCrop(
  document: EditorDocument,
  nextTransform: DocumentTransform,
): { crop: Rect | null; aspectRatio: number | null } {
  const nextStage = stageRect({ ...document, transform: nextTransform });

  if (!document.crop) {
    const aspectRatio = rotateAspectRatio(document, nextTransform);
    return { crop: null, aspectRatio };
  }

  const previousToImage = invert(imageToStage(document.source, document.transform));
  const imageToNext = imageToStage(document.source, nextTransform);
  const mapped = transformBounds(compose(imageToNext, previousToImage), document.crop);

  const aspectRatio = rotateAspectRatio(document, nextTransform);
  const crop = constrainRect(mapped, nextStage, { aspectRatio });
  return { crop, aspectRatio };
}

/** A quarter turn swaps the axes, so a locked 16:9 becomes a locked 9:16. */
function rotateAspectRatio(document: EditorDocument, nextTransform: DocumentTransform): number | null {
  if (document.aspectRatio == null) return null;
  const delta = nextTransform.rotation - document.transform.rotation;
  const swaps = Math.abs(Math.abs(Math.sin(delta)) - 1) < 1e-6;
  return swaps ? 1 / document.aspectRatio : document.aspectRatio;
}

export function setTransform(document: EditorDocument, transform: DocumentTransform): EditorDocument {
  const next: DocumentTransform = { ...transform, rotation: positiveAngle(transform.rotation) };
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
  const imageFromStage = invert(imageToStage(rotated.source, rotated.transform));
  const atCropCentre = centredRect(center(effectiveCrop(rotated)), size);
  const crop = rectIsAllImage(atCropCentre, imageFromStage, rotated.source)
    ? atCropCentre
    : centredRect(center(stageRect(rotated)), size);

  return { ...rotated, crop };
}

export function flip(document: EditorDocument, axis: "x" | "y"): EditorDocument {
  const transform: DocumentTransform =
    axis === "x"
      ? { ...document.transform, flipX: !document.transform.flipX }
      : { ...document.transform, flipY: !document.transform.flipY };
  return setTransform(document, transform);
}

export function setCrop(document: EditorDocument, crop: Rect | null): EditorDocument {
  if (crop === null) return { ...document, crop: null };
  return { ...document, crop: constrainRect(crop, stageRect(document), { aspectRatio: document.aspectRatio }) };
}

export function dragCropHandle(
  document: EditorDocument,
  handle: CropHandle,
  pointer: Point,
  minSize = DEFAULT_MIN_CROP_SIZE,
): EditorDocument {
  const bounds = stageRect(document);
  const crop = resizeCrop(effectiveCrop(document), handle, pointer, {
    bounds,
    aspectRatio: document.aspectRatio,
    minSize,
  });
  return { ...document, crop };
}

export function panCrop(document: EditorDocument, delta: Point): EditorDocument {
  return { ...document, crop: moveCrop(effectiveCrop(document), delta, stageRect(document)) };
}

export function setAspectRatio(document: EditorDocument, aspectRatio: number | null): EditorDocument {
  const bounds = stageRect(document);
  const crop = applyAspectRatio(effectiveCrop(document), aspectRatio, bounds);
  return { ...document, aspectRatio, crop };
}

export function setAdjustments(document: EditorDocument, adjustments: Partial<Adjustments>): EditorDocument {
  // Clamped on the way in: a host value outside the range would otherwise reach
  // the filter string and the exported pixels.
  return { ...document, adjustments: clampAdjustments({ ...document.adjustments, ...adjustments }) };
}

/**
 * Sets or clears the frame.
 *
 * A partial patch turns one on with the defaults filled in, so a host that only
 * cares about the colour writes only the colour.
 */
export function setFrame(document: EditorDocument, frame: Partial<FrameSettings> | null): EditorDocument {
  if (frame === null) return { ...document, frame: null };
  const width = Math.min(MAX_FRAME_WIDTH, Math.max(MIN_FRAME_WIDTH, frame.width ?? document.frame?.width ?? DEFAULT_FRAME.width));
  return { ...document, frame: { ...DEFAULT_FRAME, ...document.frame, ...frame, width } };
}

export function setOutput(document: EditorDocument, output: Partial<OutputSettings>): EditorDocument {
  return { ...document, output: { ...document.output, ...output } };
}

export function addLayer(document: EditorDocument, layer: EditorLayer, index?: number): EditorDocument {
  const layers = [...document.layers];
  layers.splice(index ?? layers.length, 0, layer);
  return { ...document, layers };
}

export function updateLayer(
  document: EditorDocument,
  id: string,
  patch: Partial<EditorLayer> | ((layer: EditorLayer) => EditorLayer),
): EditorDocument {
  const layers = document.layers.map((layer) => {
    if (layer.id !== id) return layer;
    return typeof patch === "function" ? patch(layer) : ({ ...layer, ...patch } as EditorLayer);
  });
  return { ...document, layers };
}

/**
 * Applies a pointer drag on one of a layer's own handles.
 *
 * Resize and rotate arrive through the same door because they are the same
 * gesture to the user — grab a handle, drag — and the handle itself decides
 * which one it is.
 */
export function dragLayerHandle(
  document: EditorDocument,
  id: string,
  handle: LayerHandle,
  pointer: Point,
  options: { minSize?: number; aspectRatio?: number | null; snap?: number } = {},
): EditorDocument {
  return updateLayer(document, id, (layer) =>
    handle === "rotate"
      ? rotateLayer(layer, pointer, options.snap === undefined ? {} : { snap: options.snap })
      : resizeLayer(layer, handle, pointer, {
          ...(options.minSize === undefined ? {} : { minSize: options.minSize }),
          ...(options.aspectRatio === undefined ? {} : { aspectRatio: options.aspectRatio }),
        }),
  );
}

export function removeLayer(document: EditorDocument, id: string): EditorDocument {
  return { ...document, layers: document.layers.filter((layer) => layer.id !== id) };
}

export function moveLayerBy(document: EditorDocument, id: string, delta: Point): EditorDocument {
  return updateLayer(document, id, (layer) => translateLayer(layer, delta.x, delta.y));
}

/** Reorders a layer; `index` is clamped, so callers can pass -1 or Infinity. */
export function reorderLayer(document: EditorDocument, id: string, index: number): EditorDocument {
  const layers = [...document.layers];
  const from = layers.findIndex((layer) => layer.id === id);
  if (from === -1) return document;
  const [layer] = layers.splice(from, 1);
  if (!layer) return document;
  const to = Math.min(Math.max(index, 0), layers.length);
  layers.splice(to, 0, layer);
  return { ...document, layers };
}

/** Keeps every layer's bounding box overlapping the image, so nothing is lost off-canvas. */
export function clampLayersToImage(document: EditorDocument): EditorDocument {
  const bounds: Rect = { x: 0, y: 0, width: document.source.width, height: document.source.height };
  const layers = document.layers.map((layer) => {
    const box = layerBounds(layer);
    const clamped = clampInside(box, bounds);
    if (clamped.x === box.x && clamped.y === box.y) return layer;
    return translateLayer(layer, clamped.x - box.x, clamped.y - box.y);
  });
  return { ...document, layers };
}

export function resetEdits(document: EditorDocument): EditorDocument {
  return {
    ...document,
    transform: { rotation: 0, flipX: false, flipY: false },
    crop: null,
    aspectRatio: null,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    frame: null,
    layers: [],
    output: { ...document.output, width: null, height: null },
  };
}
