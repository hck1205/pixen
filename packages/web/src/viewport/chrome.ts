import { toArray, type CropHandle, type Matrix, type Point, type Rect } from "@pixen/core";
import { cornerSegments, gridSegments, type Segment } from "./overlay.js";

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
const SELECTION_DASH: readonly [number, number] = [5, 4];
/** Grip size in CSS pixels; the hit radius in `gestures/constants.ts` is larger on purpose. */
const HANDLE_SIZE = 9;
const HANDLE_RIM = "rgba(255, 255, 255, 0.92)";
const HANDLE_RIM_WIDTH = 1.5;
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

/** The four corners of the selection box, in the order a path visits them. */
export const SELECTION_CORNERS: readonly CropHandle[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
];

export interface LayerSelectionChrome {
  /** The four corners, already projected into device pixels. */
  quad: readonly Point[];
  /** Grab points to draw; empty for a locked layer. */
  handles: readonly Point[];
  /** The rotate grip above the top edge, or null when it is not offered. */
  rotate: Point | null;
  colour: string;
  dpr: number;
}

/**
 * The selected layer's box, its handles, and the stem to its rotate grip.
 *
 * Drawn as a quad rather than a rect because a rotated layer's box is not
 * axis-aligned, and a dashed rectangle around it would sit visibly off the
 * thing it claims to select.
 */
export function drawLayerSelection(context: CanvasRenderingContext2D, chrome: LayerSelectionChrome): void {
  const { quad, handles, rotate, colour, dpr } = chrome;
  if (quad.length === 0) return;

  context.save();
  context.strokeStyle = colour;
  context.lineWidth = OUTLINE_WIDTH * dpr;
  context.setLineDash(SELECTION_DASH.map((value) => value * dpr));
  context.beginPath();
  context.moveTo(quad[0]!.x, quad[0]!.y);
  for (const point of quad.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
  context.stroke();
  context.restore();

  if (rotate) {
    // The stem leaves from the middle of the top edge, wherever that now is.
    const topEdgeMidpoint = midpoint(quad[0]!, quad[1] ?? quad[0]!);
    context.save();
    context.strokeStyle = colour;
    context.lineWidth = OUTLINE_WIDTH * dpr;
    context.beginPath();
    context.moveTo(topEdgeMidpoint.x, topEdgeMidpoint.y);
    context.lineTo(rotate.x, rotate.y);
    context.stroke();
    context.restore();

    drawGrip(context, rotate, colour, dpr, "round");
  }

  for (const handle of handles) drawGrip(context, handle, colour, dpr, "square");
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** A filled grip with a light rim, so it reads on both a dark and a pale image. */
function drawGrip(
  context: CanvasRenderingContext2D,
  point: Point,
  colour: string,
  dpr: number,
  shape: "square" | "round",
): void {
  const size = HANDLE_SIZE * dpr;
  context.save();
  context.fillStyle = colour;
  context.strokeStyle = HANDLE_RIM;
  context.lineWidth = HANDLE_RIM_WIDTH * dpr;
  context.beginPath();
  if (shape === "round") {
    context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
  } else {
    context.rect(point.x - size / 2, point.y - size / 2, size, size);
  }
  context.fill();
  context.stroke();
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
