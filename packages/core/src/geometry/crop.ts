import { clampInside, constrainRect, fitAspectRatio } from "./rect.js";
import type { Point, Rect } from "./types.js";

export type CropHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export const CROP_HANDLES: readonly CropHandle[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
];

interface HandleAxes {
  /** -1 pulls the left edge, 1 pulls the right edge, 0 leaves the axis alone. */
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

const HANDLE_AXES: Record<CropHandle, HandleAxes> = {
  "top-left": { x: -1, y: -1 },
  top: { x: 0, y: -1 },
  "top-right": { x: 1, y: -1 },
  right: { x: 1, y: 0 },
  "bottom-right": { x: 1, y: 1 },
  bottom: { x: 0, y: 1 },
  "bottom-left": { x: -1, y: 1 },
  left: { x: -1, y: 0 },
};

export function handleAxes(handle: CropHandle): HandleAxes {
  return HANDLE_AXES[handle];
}

/** Stage-space position of a crop handle. */
export function handlePosition(crop: Rect, handle: CropHandle): Point {
  const { x, y } = HANDLE_AXES[handle];
  return {
    x: crop.x + crop.width * (x === -1 ? 0 : x === 1 ? 1 : 0.5),
    y: crop.y + crop.height * (y === -1 ? 0 : y === 1 ? 1 : 0.5),
  };
}

export interface ResizeCropOptions {
  /** Region the crop may not leave — normally the stage rect. */
  bounds: Rect;
  aspectRatio?: number | null;
  minSize?: number;
}

/**
 * Applies a pointer drag on `handle` to `crop`.
 *
 * Edges opposite the dragged handle stay pinned; with an aspect ratio the free
 * axis follows the dragged one, anchored on the handle's opposite corner so the
 * rect grows the way the pointer moves rather than around its centre.
 */
export function resizeCrop(
  crop: Rect,
  handle: CropHandle,
  pointer: Point,
  options: ResizeCropOptions,
): Rect {
  const { bounds } = options;
  const aspectRatio = options.aspectRatio ?? null;
  const minSize = options.minSize ?? 16;
  const axes = HANDLE_AXES[handle];

  let left = crop.x;
  let top = crop.y;
  let rightEdge = crop.x + crop.width;
  let bottomEdge = crop.y + crop.height;

  const clampedX = Math.min(Math.max(pointer.x, bounds.x), bounds.x + bounds.width);
  const clampedY = Math.min(Math.max(pointer.y, bounds.y), bounds.y + bounds.height);

  if (axes.x === -1) left = Math.min(clampedX, rightEdge - minSize);
  if (axes.x === 1) rightEdge = Math.max(clampedX, left + minSize);
  if (axes.y === -1) top = Math.min(clampedY, bottomEdge - minSize);
  if (axes.y === 1) bottomEdge = Math.max(clampedY, top + minSize);

  let width = rightEdge - left;
  let height = bottomEdge - top;

  if (aspectRatio) {
    // Side handles drive a single axis; corner handles use whichever axis the
    // pointer pushed further so diagonal drags feel direct.
    const drivesWidth =
      axes.y === 0 || (axes.x !== 0 && width / aspectRatio >= height);
    if (drivesWidth) {
      height = width / aspectRatio;
    } else {
      width = height * aspectRatio;
    }

    const maxWidth = axes.x === -1 ? rightEdge - bounds.x : axes.x === 1 ? bounds.x + bounds.width - left : bounds.width;
    const maxHeight = axes.y === -1 ? bottomEdge - bounds.y : axes.y === 1 ? bounds.y + bounds.height - top : bounds.height;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width *= scale;
    height *= scale;

    if (width < minSize || height < minSize) {
      const grow = Math.max(minSize / width, minSize / height);
      width *= grow;
      height *= grow;
    }

    // Anchor: the edges the handle does not control stay where they are.
    if (axes.x === -1) left = rightEdge - width;
    else if (axes.x === 1) rightEdge = left + width;
    else {
      const cx = (left + rightEdge) / 2;
      left = cx - width / 2;
      rightEdge = cx + width / 2;
    }

    if (axes.y === -1) top = bottomEdge - height;
    else if (axes.y === 1) bottomEdge = top + height;
    else {
      const cy = (top + bottomEdge) / 2;
      top = cy - height / 2;
      bottomEdge = cy + height / 2;
    }
  }

  const resized: Rect = { x: left, y: top, width: rightEdge - left, height: bottomEdge - top };
  return constrainRect(resized, bounds, { aspectRatio, minSize });
}

/** Moves a crop rect by a stage-space delta, keeping it inside `bounds`. */
export function moveCrop(crop: Rect, delta: Point, bounds: Rect): Rect {
  return clampInside({ ...crop, x: crop.x + delta.x, y: crop.y + delta.y }, bounds);
}

/**
 * Re-fits a crop to a new aspect ratio, preserving as much of the selected area
 * as possible. `null` keeps the current rect and just unlocks the ratio.
 */
export function applyAspectRatio(crop: Rect, aspectRatio: number | null, bounds: Rect): Rect {
  if (aspectRatio === null) return clampInside(crop, bounds);

  const targetArea = Math.max(crop.width * crop.height, 1);
  let width = Math.sqrt(targetArea * aspectRatio);
  let height = width / aspectRatio;

  const maxFit = fitAspectRatio(bounds, aspectRatio);
  if (width > maxFit.width) {
    width = maxFit.width;
    height = maxFit.height;
  }

  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  return clampInside({ x: cx - width / 2, y: cy - height / 2, width, height }, bounds);
}
