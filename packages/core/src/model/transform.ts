import { QUARTER_TURN, normaliseAngle } from "../geometry/angles.js";
import { CROP_HANDLES, handlePosition, type CropHandle } from "../geometry/crop.js";
import { center, longestEdge } from "../geometry/rect.js";
import type { Point, Rect, Size } from "../geometry/types.js";
import { layerBounds } from "./layers.js";
import type { TextMeasurer } from "./text-layout.js";
import type { EditorLayer } from "./types.js";

/**
 * Resizing and rotating a layer, as pure geometry.
 *
 * Every layer type reduces to one question — what happens to its bounding box —
 * so one mapping serves all of them and each type only says how its own points
 * follow. Keeping the decision here means a drag is reachable from a unit test
 * with plain numbers, and the viewport is left with nothing but projection.
 */
export type LayerHandle = CropHandle | "rotate";

/**
 * The eight resize handles, then the rotate handle above the top edge.
 *
 * Built from `CROP_HANDLES` rather than restating them: the type already says a
 * layer handle is a crop handle or the rotate grip, and a hand-written copy is
 * a second place for the order to be wrong in.
 */
export const LAYER_HANDLES: readonly LayerHandle[] = [...CROP_HANDLES, "rotate"];

/** Smallest extent a resize may leave, in image pixels. */
const DEFAULT_MIN_LAYER_SIZE = 4;

/**
 * How far the rotate handle sits above the top edge, as a fraction of the
 * bounds' longest edge — so it stays clear of a flat line as well as a square.
 */
const ROTATE_HANDLE_OFFSET_RATIO = 0.2;

/** Rotation snap while a modifier is held. */
export const ROTATION_SNAP = Math.PI / 12;

export interface ResizeLayerOptions {
  minSize?: number;
  /** Locks width to height, as a corner drag on a bitmap usually wants. */
  aspectRatio?: number | null;
  /** How a caption is measured, so a text layer resizes about its own box. */
  measure?: TextMeasurer;
}

export interface RotateLayerOptions {
  /** Rounds the result to a multiple of this angle. 0 leaves it free. */
  snap?: number;
  /** How a caption is measured, so a text layer turns about its own centre. */
  measure?: TextMeasurer;
}

function rotatePoint(point: Point, about: Point, radians: number): Point {
  if (!radians) return point;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - about.x;
  const dy = point.y - about.y;
  return { x: about.x + dx * cos - dy * sin, y: about.y + dx * sin + dy * cos };
}

/** Which edges a handle drags: -1 the near edge, 1 the far edge, 0 neither. */
const HANDLE_AXES: Record<CropHandle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  "top-left": { x: -1, y: -1 },
  top: { x: 0, y: -1 },
  "top-right": { x: 1, y: -1 },
  right: { x: 1, y: 0 },
  "bottom-right": { x: 1, y: 1 },
  bottom: { x: 0, y: 1 },
  "bottom-left": { x: -1, y: 1 },
  left: { x: -1, y: 0 },
};

/**
 * Image-space position of a handle, following the layer's own rotation.
 *
 * The renderer turns a layer about its bounds centre, so the handles do too;
 * anything else would put the grab points somewhere the layer is not.
 */
export function layerHandlePosition(
  layer: EditorLayer,
  handle: LayerHandle,
  measure?: TextMeasurer,
): Point {
  const bounds = layerBounds(layer, measure);
  const centre = center(bounds);
  const local =
    handle === "rotate"
      ? { x: centre.x, y: bounds.y - longestEdge(bounds) * ROTATE_HANDLE_OFFSET_RATIO }
      : handlePosition(bounds, handle);
  return rotatePoint(local, centre, layer.rotation);
}

/**
 * Maps a layer from one bounding box to another.
 *
 * This is the whole of resizing: every layer type answers only how its own
 * points ride along. A zero-extent axis — a horizontal line, a single-point
 * path — translates rather than scaling, since there is nothing to scale.
 */
export function scaleLayerToBounds(layer: EditorLayer, from: Rect, to: Rect): EditorLayer {
  const scaleX = from.width === 0 ? 1 : to.width / from.width;
  const scaleY = from.height === 0 ? 1 : to.height / from.height;
  const map = (point: Point): Point => ({
    x: to.x + (point.x - from.x) * scaleX,
    y: to.y + (point.y - from.y) * scaleY,
  });

  switch (layer.type) {
    case "rect":
    case "ellipse":
    case "image":
    case "redact":
      return { ...layer, frame: to };
    case "line":
      return { ...layer, from: map(layer.from), to: map(layer.to) };
    case "path":
      return { ...layer, points: layer.points.map(map) };
    case "text":
      // Height drives the type size, width the wrapping column: a drag on the
      // side edge should reflow the text rather than distort the glyphs.
      return {
        ...layer,
        position: map(layer.position),
        fontSize: Math.max(1, layer.fontSize * scaleY),
        ...(layer.maxWidth ? { maxWidth: Math.max(1, layer.maxWidth * scaleX) } : {}),
      };
  }
}

/**
 * Applies a pointer drag on a resize handle.
 *
 * The pointer is taken into the layer's own unrotated frame, the edges opposite
 * the handle stay pinned, and the result is shifted so the anchor corner is
 * exactly where it was on screen — otherwise a rotated layer would swim away
 * from the pointer as it grew.
 */
export function resizeLayer(
  layer: EditorLayer,
  handle: CropHandle,
  pointer: Point,
  options: ResizeLayerOptions = {},
): EditorLayer {
  const minSize = options.minSize ?? DEFAULT_MIN_LAYER_SIZE;
  const aspectRatio = options.aspectRatio ?? null;
  const bounds = layerBounds(layer, options.measure);
  const centre = center(bounds);
  const axes = HANDLE_AXES[handle];

  const local = rotatePoint(pointer, centre, -layer.rotation);

  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;

  if (axes.x === -1) left = Math.min(local.x, right - minSize);
  if (axes.x === 1) right = Math.max(local.x, left + minSize);
  if (axes.y === -1) top = Math.min(local.y, bottom - minSize);
  if (axes.y === 1) bottom = Math.max(local.y, top + minSize);

  let width = right - left;
  let height = bottom - top;

  if (aspectRatio) {
    ({ width, height } = lockedSize(width, height, axes, aspectRatio, minSize));

    // An axis the handle drives grows away from the pinned edge. An axis it does
    // not — the vertical one under a side handle — grows about its own centre,
    // which is what keeps the opposite edge's midpoint still. Pinning that axis's
    // near edge instead walked the whole layer down the picture as it widened.
    [left, right] = spanFor(left, right, width, axes.x);
    [top, bottom] = spanFor(top, bottom, height, axes.y);
  }

  const resized: Rect = { x: left, y: top, width: right - left, height: bottom - top };

  // The corner opposite the handle does not move in the layer's own frame, so
  // pinning it on screen is a matter of undoing however far the centre drifted.
  const anchor = handlePosition(bounds, oppositeHandle(handle));
  const before = rotatePoint(anchor, centre, layer.rotation);
  const after = rotatePoint(anchor, center(resized), layer.rotation);

  return scaleLayerToBounds(layer, bounds, {
    ...resized,
    x: resized.x + before.x - after.x,
    y: resized.y + before.y - after.y,
  });
}

function oppositeHandle(handle: CropHandle): CropHandle {
  const axes = HANDLE_AXES[handle];
  const flipped = { x: -axes.x, y: -axes.y };
  const found = (Object.keys(HANDLE_AXES) as CropHandle[]).find((candidate) => {
    const other = HANDLE_AXES[candidate];
    return other.x === flipped.x && other.y === flipped.y;
  });
  return found ?? handle;
}

/** Points the layer's top edge at the pointer, turning about its bounds centre. */
export function rotateLayer(
  layer: EditorLayer,
  pointer: Point,
  options: RotateLayerOptions = {},
): EditorLayer {
  const centre = center(layerBounds(layer, options.measure));
  // The handle sits above the layer, so a pointer straight up is no rotation.
  const angle = Math.atan2(pointer.y - centre.y, pointer.x - centre.x) + QUARTER_TURN;
  const snap = options.snap ?? 0;
  return { ...layer, rotation: normaliseAngle(snap > 0 ? Math.round(angle / snap) * snap : angle) };
}

/**
 * The size a locked ratio allows, honouring the floor on *both* axes.
 *
 * The floor is applied to the dragged axis before the ratio derives the other
 * one, so the derived axis had no floor at all: a 10:1 layer collapsed to 20×2
 * when asked for a minimum of 20. The smallest box on a given ratio that clears
 * the floor on both axes is what this returns instead.
 */
function lockedSize(
  width: number,
  height: number,
  axes: { x: number; y: number },
  aspectRatio: number,
  minSize: number,
): Size {
  // A side handle drives one axis; a corner takes whichever the pointer pushed
  // further, so a diagonal drag follows the hand.
  const driven = axes.y === 0 || (axes.x !== 0 && width / aspectRatio >= height);
  const locked = driven ? { width, height: width / aspectRatio } : { width: height * aspectRatio, height };

  const minWidth = Math.max(minSize, minSize * aspectRatio);
  if (locked.width >= minWidth) return locked;
  return { width: minWidth, height: minWidth / aspectRatio };
}

/** Where an axis's edges land: away from the pinned one, or about the centre. */
function spanFor(near: number, far: number, length: number, axis: number): [number, number] {
  if (axis === -1) return [far - length, far];
  if (axis === 1) return [near, near + length];
  const middle = (near + far) / 2;
  return [middle - length / 2, middle + length / 2];
}
