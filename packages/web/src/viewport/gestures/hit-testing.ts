import { CROP_HANDLES, layerBounds, type CropHandle, type EditorLayer, type Point, type Rect } from "@pixen/core";
import { HANDLE_HIT_RADIUS, LAYER_HIT_TOLERANCE_RATIO } from "./constants.js";
import { screenToImage, stageToScreen } from "./coordinates.js";
import type { GestureContext } from "./types.js";

/** What is under the pointer, and what the cursor should say about it. */
export function cropHandlePosition(crop: Rect, handle: CropHandle): Point {
  const x = handle.includes("left") ? 0 : handle.includes("right") ? 1 : 0.5;
  const y = handle.startsWith("top") ? 0 : handle.startsWith("bottom") ? 1 : 0.5;
  return { x: crop.x + crop.width * x, y: crop.y + crop.height * y };
}

/** The nearest crop handle within the hit radius, in screen space. */
export function hitCropHandle(context: GestureContext, point: Point): CropHandle | null {
  let best: { handle: CropHandle; distance: number } | null = null;
  for (const handle of CROP_HANDLES) {
    const screen = stageToScreen(context, cropHandlePosition(context.crop, handle));
    const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
    if (distance <= HANDLE_HIT_RADIUS && (!best || distance < best.distance)) {
      best = { handle, distance };
    }
  }
  return best?.handle ?? null;
}

export function isInsideCrop(crop: Rect, stagePoint: Point): boolean {
  return (
    stagePoint.x >= crop.x &&
    stagePoint.x <= crop.x + crop.width &&
    stagePoint.y >= crop.y &&
    stagePoint.y <= crop.y + crop.height
  );
}

/** Topmost selectable layer whose padded bounding box contains the point. */
export function hitLayer(context: GestureContext, imagePoint: Point): EditorLayer | null {
  const tolerance = context.imageLongestEdge * 0.01;
  for (let i = context.layers.length - 1; i >= 0; i -= 1) {
    const layer = context.layers[i]!;
    if (!layer.visible || layer.locked) continue;
    const bounds = layerBounds(layer);
    if (
      imagePoint.x >= bounds.x - tolerance &&
      imagePoint.x <= bounds.x + bounds.width + tolerance &&
      imagePoint.y >= bounds.y - tolerance &&
      imagePoint.y <= bounds.y + bounds.height + tolerance
    ) {
      return layer;
    }
  }
  return null;
}

export function cursorForHandle(handle: CropHandle): string {
  switch (handle) {
    case "top":
    case "bottom":
      return "ns-resize";
    case "left":
    case "right":
      return "ew-resize";
    case "top-left":
    case "bottom-right":
      return "nwse-resize";
    default:
      return "nesw-resize";
  }
}

/** The cursor for a hover at `point`, given the active tool. */
export function cursorFor(context: GestureContext, point: Point): string {
  if (context.tool === "crop") {
    const handle = hitCropHandle(context, point);
    return handle ? cursorForHandle(handle) : "grab";
  }
  if (context.tool === "select") {
    return hitLayer(context, screenToImage(context, point)) ? "move" : "default";
  }
  return "crosshair";
}
