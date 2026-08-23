import { longestEdge, transformBounds } from "../geometry/rect.js";
import { stageToImage } from "../geometry/spaces.js";
import type { Rect, Size } from "../geometry/types.js";
import { effectiveCrop } from "../model/document.js";
import { createImageLayer, createTextLayer, layerBounds, translateLayer } from "../model/layers.js";
import type { TextMeasurer } from "../model/text-layout.js";
import { DEFAULT_TEXT_COLOUR } from "../model/defaults.js";
import type { EditorDocument, ImageLayer, TextLayer } from "../model/types.js";

/**
 * Layers placed by arithmetic rather than by a pointer.
 *
 * A watermark is not a new kind of thing — it is a bitmap in a corner, at an
 * opacity, possibly tiled — and neither is a sticker, which is a bitmap in the
 * middle of what the person can currently see. Expressing them that way means
 * they undo, serialise, export and survive a rotate exactly like every other
 * layer, and leaves this module with nothing but the arithmetic of where each
 * one goes.
 */
/**
 * Every placement, in reading order, as the list rather than as a union — the
 * pattern the rest of the model uses for `FRAME_STYLES` and `REDACTION_MODES`,
 * so a picker can be built from it instead of restating it.
 */
export const WATERMARK_POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "centre",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
  "tile",
] as const;

export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

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

/**
 * Where a mark of `size` sits inside `region`, in the region's own space.
 *
 * Takes a rect rather than a size because the region is not always the whole
 * image: a sticker lands in the middle of what is *cropped*, which is the part
 * the person can see.
 */
export function placeWithin(
  region: Rect,
  size: Size,
  position: Exclude<WatermarkPosition, "tile">,
  margin: number,
): Rect {
  const inset = margin * longestEdge(region);

  const left = region.x + inset;
  const centreX = region.x + (region.width - size.width) / 2;
  const right = region.x + region.width - size.width - inset;
  const top = region.y + inset;
  const centreY = region.y + (region.height - size.height) / 2;
  const bottom = region.y + region.height - size.height - inset;

  return {
    x: position.includes("left") ? left : position.includes("right") ? right : centreX,
    y: position.startsWith("top") ? top : position.startsWith("bottom") ? bottom : centreY,
    width: size.width,
    height: size.height,
  };
}

/** A region rect for the whole of an image, which is what a watermark uses. */
function wholeOf(image: Size): Rect {
  return { x: 0, y: 0, width: image.width, height: image.height };
}

/** Where the mark sits, in image space. Tiling covers the whole image. */
export function watermarkFrame(image: Size, options: WatermarkOptions): Rect {
  const position = options.position ?? DEFAULT_WATERMARK_POSITION;
  if (position === "tile") return { x: 0, y: 0, width: image.width, height: image.height };

  const width = Math.max(1, (options.scale ?? DEFAULT_WATERMARK_SCALE) * longestEdge(image));
  const ratio = options.size.height / Math.max(1, options.size.width);
  return placeWithin(
    wholeOf(image),
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

/**
 * A sticker: a bitmap dropped in the middle of what the person can see, at a
 * size they can immediately grab a handle on.
 */
const DEFAULT_STICKER_SCALE = 0.3;

export function stickerFrame(region: Rect, size: Size, scale = DEFAULT_STICKER_SCALE): Rect {
  const width = Math.max(1, scale * longestEdge(region));
  const ratio = size.height / Math.max(1, size.width);
  return placeWithin(region, { width, height: Math.max(1, width * ratio) }, "centre", 0);
}

export interface StickerOptions {
  resourceId: string;
  /** The bitmap's own pixels, which set the aspect ratio it is placed at. */
  size: Size;
  scale?: number;
  name?: string;
}

/** What an unnamed sticker is called in the layer list. */
const DEFAULT_STICKER_NAME = "sticker";

/**
 * A sticker placed in the middle of what is currently cropped.
 *
 * The crop is a stage rectangle and a layer lives in image coordinates, so the
 * region has to come back through `stageToImage` before anything is placed in
 * it — otherwise a sticker added to a rotated picture lands beside the frame
 * rather than inside it.
 */
export function createStickerLayer(document: EditorDocument, options: StickerOptions): ImageLayer {
  const region = transformBounds(
    stageToImage(document.source, document.transform),
    effectiveCrop(document),
  );
  return createImageLayer(options.resourceId, stickerFrame(region, options.size, options.scale), {
    name: options.name ?? DEFAULT_STICKER_NAME,
  });
}

/** Text is measured in type size, so it needs a smaller default than a logo. */
export const DEFAULT_TEXT_WATERMARK_SCALE = 0.045;

export function createTextWatermarkLayer(
  image: Size,
  options: TextWatermarkOptions,
  measure?: TextMeasurer,
): TextLayer {
  const fontSize = Math.max(1, (options.scale ?? DEFAULT_TEXT_WATERMARK_SCALE) * longestEdge(image));
  const draft = createTextLayer({ x: 0, y: 0 }, options.text, {
    fontSize,
    color: options.colour ?? DEFAULT_TEXT_COLOUR,
    opacity: options.opacity ?? DEFAULT_WATERMARK_OPACITY,
    name: "watermark",
    ...(options.fontFamily ? { fontFamily: options.fontFamily } : {}),
    ...(options.backgroundColor === undefined ? {} : { backgroundColor: options.backgroundColor }),
  });

  // Placed by the same box the renderer lays the letters out in, so the margin
  // the caller asked for is the margin they get. Measured by whoever has a
  // canvas; without one this is the estimate, and a long watermark of wide
  // letters can sit closer to the edge than asked.
  const bounds = layerBounds(draft, measure);
  const frame = placeWithin(
    wholeOf(image),
    { width: bounds.width, height: bounds.height },
    (options.position ?? DEFAULT_WATERMARK_POSITION) as Exclude<WatermarkPosition, "tile">,
    options.margin ?? DEFAULT_WATERMARK_MARGIN,
  );
  return translateLayer(draft, frame.x - bounds.x, frame.y - bounds.y) as TextLayer;
}
