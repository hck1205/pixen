/**
 * The list of things drawn on the picture, and what may be done to a row of it.
 *
 * Adding, editing, moving, reordering and removing. The one rule they all obey
 * is that a layer stays inside the image: a gesture can take a handle past the
 * edge, and a document that stored it would render a mark nobody can reach.
 */
import { clamp } from "../../fp/function.js";
import { clampInside } from "../../geometry/rect.js";
import type { Point, Rect } from "../../geometry/types.js";
import { layerBounds, translateLayer } from "../../model/layers.js";
import type { TextMeasurer } from "../../model/text-layout.js";
import { resizeLayer, rotateLayer, type LayerHandle } from "../../model/transform.js";
import type { EditorDocument, EditorLayer } from "../../model/types.js";

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
  options: { minSize?: number; aspectRatio?: number | null; snap?: number; measure?: TextMeasurer } = {},
): EditorDocument {
  return updateLayer(document, id, (layer) =>
    handle === "rotate"
      ? rotateLayer(layer, pointer, { snap: options.snap, measure: options.measure })
      : resizeLayer(layer, handle, pointer, {
          minSize: options.minSize,
          aspectRatio: options.aspectRatio,
          measure: options.measure,
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
  const to = clamp(index, 0, layers.length);
  layers.splice(to, 0, layer);
  return { ...document, layers };
}

/** Keeps every layer's bounding box overlapping the image, so nothing is lost off-canvas. */
export function clampLayersToImage(document: EditorDocument, measure?: TextMeasurer): EditorDocument {
  const bounds: Rect = { x: 0, y: 0, width: document.source.width, height: document.source.height };
  const layers = document.layers.map((layer) => {
    const box = layerBounds(layer, measure);
    const clamped = clampInside(box, bounds);
    if (clamped.x === box.x && clamped.y === box.y) return layer;
    return translateLayer(layer, clamped.x - box.x, clamped.y - box.y);
  });
  return { ...document, layers };
}
