import type { Rect, Size } from "../geometry/types.js";
import { createImageLayer } from "../model/layers.js";
import type { ImageLayer } from "../model/types.js";

/**
 * Watermarks, as placement maths over an image layer.
 *
 * A watermark is not a new kind of thing — it is a bitmap in a corner, at an
 * opacity, possibly tiled. Expressing it that way means it undoes, serialises,
 * exports and survives a rotate exactly like every other layer, and leaves this
 * module with nothing but the arithmetic of where it goes.
 */
export type WatermarkPosition =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "centre"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"
  | "tile";

export interface WatermarkOptions {
  /** The registered bitmap, and its natural size, which sets the aspect ratio. */
  resourceId: string;
  size: Size;
  position?: WatermarkPosition;
  /** Width as a fraction of the image's longest edge. */
  scale?: number;
  /** Distance from the edges, as a fraction of the image's longest edge. */
  margin?: number;
  opacity?: number;
}

export const DEFAULT_WATERMARK_POSITION: WatermarkPosition = "bottom-right";
export const DEFAULT_WATERMARK_SCALE = 0.18;
export const DEFAULT_WATERMARK_MARGIN = 0.03;
export const DEFAULT_WATERMARK_OPACITY = 0.6;

/** Where the mark sits, in image space. Tiling covers the whole image. */
export function watermarkFrame(image: Size, options: WatermarkOptions): Rect {
  const position = options.position ?? DEFAULT_WATERMARK_POSITION;
  const longestEdge = Math.max(image.width, image.height);
  const margin = (options.margin ?? DEFAULT_WATERMARK_MARGIN) * longestEdge;

  if (position === "tile") return { x: 0, y: 0, width: image.width, height: image.height };

  const width = Math.max(1, (options.scale ?? DEFAULT_WATERMARK_SCALE) * longestEdge);
  const ratio = options.size.height / Math.max(1, options.size.width);
  const height = Math.max(1, width * ratio);

  const left = margin;
  const centreX = (image.width - width) / 2;
  const right = image.width - width - margin;
  const top = margin;
  const centreY = (image.height - height) / 2;
  const bottom = image.height - height - margin;

  const x = position.includes("left") ? left : position.includes("right") ? right : centreX;
  const y = position.startsWith("top") ? top : position.startsWith("bottom") ? bottom : centreY;

  return { x, y, width, height };
}

/** The layer to add. Tiling repeats the bitmap at its natural size. */
export function createWatermarkLayer(image: Size, options: WatermarkOptions): ImageLayer {
  const position = options.position ?? DEFAULT_WATERMARK_POSITION;
  return createImageLayer(options.resourceId, watermarkFrame(image, options), {
    repeat: position === "tile",
    opacity: options.opacity ?? DEFAULT_WATERMARK_OPACITY,
    name: "watermark",
  });
}
