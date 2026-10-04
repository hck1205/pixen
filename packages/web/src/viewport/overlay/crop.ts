import { toArray, type Matrix, type Rect } from "@pixen/core";
import { CORNER_ARM, cornerSegments, gridSegments } from "./geometry.js";
import { OUTLINE_WIDTH, strokeSegments } from "./ink.js";
import type { OverlayPalette } from "./palette.js";

/**
 * The chrome the crop tool wears: everything outside the crop dimmed, and the
 * rect itself given guides, an outline and corner brackets.
 */

const GRID_WIDTH = 1;
const BRACKET_WIDTH = 3.5;
/** Far enough outside the stage that the scrim covers any pan. */
const SCRIM_OVERSHOOT = 1e4;

/** Dims everything outside the crop, in stage coordinates. */
export function drawCropScrim(
  context: CanvasRenderingContext2D,
  { stage, crop, matrix, colour }: { stage: Rect; crop: Rect; matrix: Matrix; colour: string },
): void {
  context.save();
  context.setTransform(...toArray(matrix));
  context.beginPath();
  // One path with the even-odd rule, rather than four rects meeting on seams.
  context.rect(
    stage.x - SCRIM_OVERSHOOT,
    stage.y - SCRIM_OVERSHOOT,
    stage.width + SCRIM_OVERSHOOT * 2,
    stage.height + SCRIM_OVERSHOOT * 2,
  );
  context.rect(crop.x, crop.y, crop.width, crop.height);
  context.fillStyle = colour;
  context.fill("evenodd");
  context.restore();
}

/** Guides, frame and corner brackets, in device pixels. */
export function drawCropFrame(
  context: CanvasRenderingContext2D,
  { rect, palette, dpr }: { rect: Rect; palette: OverlayPalette; dpr: number },
): void {
  strokeSegments(context, gridSegments(rect), palette.grid, GRID_WIDTH * dpr);

  context.save();
  context.strokeStyle = palette.outline;
  context.lineWidth = OUTLINE_WIDTH * dpr;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();

  context.save();
  context.lineCap = "square";
  strokeSegments(context, cornerSegments(rect, CORNER_ARM * dpr), palette.outline, BRACKET_WIDTH * dpr);
  context.restore();
}
