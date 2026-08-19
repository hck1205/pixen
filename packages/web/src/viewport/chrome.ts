import { toArray, type Matrix, type Rect } from "@pixen/core";
import { cornerSegments, gridSegments, inflate, type Segment } from "./overlay.js";

/**
 * Painting the crop chrome and the selection outline.
 *
 * Separated from the viewport because it is the one part of the canvas that is
 * pure decoration: it reads a rect and some colours and draws. The geometry it
 * draws comes from `overlay.ts`, which is testable on its own.
 */
export interface OverlayPalette {
  scrim: string;
  outline: string;
  grid: string;
  selection: string;
}

const FALLBACK_PALETTE: OverlayPalette = {
  scrim: "rgba(8, 9, 12, 0.62)",
  outline: "rgba(255, 255, 255, 0.95)",
  grid: "rgba(255, 255, 255, 0.28)",
  selection: "#4f8cff",
};

/** Reads the palette from the element's own custom properties, so themes apply. */
export function readOverlayPalette(styles: CSSStyleDeclaration): OverlayPalette {
  const read = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;
  return {
    scrim: read("--pixen-crop-scrim", FALLBACK_PALETTE.scrim),
    outline: read("--pixen-crop-outline", FALLBACK_PALETTE.outline),
    grid: read("--pixen-grid-line", FALLBACK_PALETTE.grid),
    selection: read("--pixen-selection", FALLBACK_PALETTE.selection),
  };
}

/** Line weights, in device pixels per unit of device pixel ratio. */
const OUTLINE_WIDTH = 1.5;
const GRID_WIDTH = 1;
const BRACKET_WIDTH = 3.5;
const BRACKET_ARM = 22;
const SELECTION_PADDING = 6;
const SELECTION_DASH: readonly [number, number] = [5, 4];
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
  strokeSegments(context, cornerSegments(rect, BRACKET_ARM * dpr), palette.outline, BRACKET_WIDTH * dpr);
  context.restore();
}

/** The dashed box around the selected annotation. */
export function drawSelectionOutline(
  context: CanvasRenderingContext2D,
  { rect, colour, dpr }: { rect: Rect; colour: string; dpr: number },
): void {
  const outline = inflate(rect, SELECTION_PADDING * dpr);
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = OUTLINE_WIDTH * dpr;
  context.setLineDash(SELECTION_DASH.map((value) => value * dpr));
  context.strokeRect(outline.x, outline.y, outline.width, outline.height);
  context.restore();
}

function strokeSegments(
  context: CanvasRenderingContext2D,
  segments: readonly Segment[],
  colour: string,
  lineWidth: number,
): void {
  if (segments.length === 0) return;
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = lineWidth;
  context.beginPath();
  for (const segment of segments) {
    context.moveTo(segment.from.x, segment.from.y);
    context.lineTo(segment.to.x, segment.to.y);
  }
  context.stroke();
  context.restore();
}
