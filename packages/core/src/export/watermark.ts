import type { Rect, Size } from "../geometry/types.js";
import { createImageLayer, createTextLayer, layerBounds, translateLayer } from "../model/layers.js";
import { DEFAULT_TEXT_COLOUR } from "../model/defaults.js";
import type { ImageLayer, TextLayer } from "../model/types.js";

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

/** Where a mark of `size` sits inside `image`, in image space. */
export function placeWithin(
  image: Size,
  size: Size,
  position: Exclude<WatermarkPosition, "tile">,
  margin: number,
): Rect {
  const inset = margin * Math.max(image.width, image.height);

  const left = inset;
  const centreX = (image.width - size.width) / 2;
  const right = image.width - size.width - inset;
  const top = inset;
  const centreY = (image.height - size.height) / 2;
  const bottom = image.height - size.height - inset;

  return {
    x: position.includes("left") ? left : position.includes("right") ? right : centreX,
    y: position.startsWith("top") ? top : position.startsWith("bottom") ? bottom : centreY,
    width: size.width,
    height: size.height,
  };
}

/** Where the mark sits, in image space. Tiling covers the whole image. */
export function watermarkFrame(image: Size, options: WatermarkOptions): Rect {
  const position = options.position ?? DEFAULT_WATERMARK_POSITION;
  if (position === "tile") return { x: 0, y: 0, width: image.width, height: image.height };

  const width = Math.max(1, (options.scale ?? DEFAULT_WATERMARK_SCALE) * Math.max(image.width, image.height));
  const ratio = options.size.height / Math.max(1, options.size.width);
  return placeWithin(
    image,
    { width, height: Math.max(1, width * ratio) },
    position,
    options.margin ?? DEFAULT_WATERMARK_MARGIN,
  );
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

/**
 * A text watermark: a credit line, not a logo.
 *
 * Tiling is deliberately not offered here — repeating text is a pattern, which
 * is a bitmap's job, and pretending otherwise would mean silently placing one
 * copy where the caller asked for many.
 */
export interface TextWatermarkOptions {
  text: string;
  position?: Exclude<WatermarkPosition, "tile">;
  /** Type size as a fraction of the image's longest edge. */
  scale?: number;
  margin?: number;
  opacity?: number;
  colour?: string;
  fontFamily?: string;
  /** A plate behind the text, for a mark that has to read on any photograph. */
  backgroundColor?: string | null;
}

/** Text is measured in type size, so it needs a smaller default than a logo. */
export const DEFAULT_TEXT_WATERMARK_SCALE = 0.045;

export function createTextWatermarkLayer(image: Size, options: TextWatermarkOptions): TextLayer {
  const fontSize = Math.max(1, (options.scale ?? DEFAULT_TEXT_WATERMARK_SCALE) * Math.max(image.width, image.height));
  const draft = createTextLayer({ x: 0, y: 0 }, options.text, {
    fontSize,
    color: options.colour ?? DEFAULT_TEXT_COLOUR,
    opacity: options.opacity ?? DEFAULT_WATERMARK_OPACITY,
    name: "watermark",
    ...(options.fontFamily ? { fontFamily: options.fontFamily } : {}),
    ...(options.backgroundColor === undefined ? {} : { backgroundColor: options.backgroundColor }),
  });

  // The layer's own bounds estimate is what the renderer will lay out against,
  // so placing by it keeps the margin the caller asked for.
  const bounds = layerBounds(draft);
  const frame = placeWithin(
    image,
    { width: bounds.width, height: bounds.height },
    (options.position ?? DEFAULT_WATERMARK_POSITION) as Exclude<WatermarkPosition, "tile">,
    options.margin ?? DEFAULT_WATERMARK_MARGIN,
  );
  return translateLayer(draft, frame.x - bounds.x, frame.y - bounds.y) as TextLayer;
}
