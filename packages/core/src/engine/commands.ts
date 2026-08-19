import {
  applyAspectRatio,
  DEFAULT_MIN_CROP_SIZE,
  moveCrop,
  resizeCrop,
  type CropHandle,
} from "../geometry/crop.js";
import { compose, invert } from "../geometry/matrix.js";
import { clampInside, constrainRect, transformBounds } from "../geometry/rect.js";
import { imageToStage } from "../geometry/spaces.js";
import type { Point, Rect } from "../geometry/types.js";
import { effectiveCrop, stageRect } from "../model/document.js";
import { layerBounds, translateLayer } from "../model/layers.js";
import type {
  Adjustments,
  DocumentTransform,
  EditorDocument,
  EditorLayer,
  OutputSettings,
} from "../model/types.js";

/**
 * Every document mutation lives here as a pure function.
 *
 * The engine, the headless API and the tests all call the same functions, so
 * "what does rotate do to a crop" has exactly one answer in the codebase.
 */

const QUARTER_TURN = Math.PI / 2;

function normaliseRotation(radians: number): number {
  const full = Math.PI * 2;
  const value = radians % full;
  return value < 0 ? value + full : value;
}

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
  const next: DocumentTransform = { ...transform, rotation: normaliseRotation(transform.rotation) };
  const { crop, aspectRatio } = remapCrop(document, next);
  return { ...document, transform: next, crop, aspectRatio };
}

export function rotateBy(document: EditorDocument, radians: number): EditorDocument {
  return setTransform(document, { ...document.transform, rotation: document.transform.rotation + radians });
}

export function rotateQuarterTurns(document: EditorDocument, turns: number): EditorDocument {
  return rotateBy(document, turns * QUARTER_TURN);
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
  return { ...document, adjustments: { ...document.adjustments, ...adjustments } };
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
    adjustments: { brightness: 0, contrast: 0, saturation: 0 },
    layers: [],
    output: { ...document.output, width: null, height: null },
  };
}
