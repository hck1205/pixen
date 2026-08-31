import { midpoint, type CropHandle, type Point } from "@pixen/core";
import { OUTLINE_WIDTH } from "./ink.js";

/**
 * The chrome a selected layer wears: its box, its grab points, and the stem to
 * the grip that turns it.
 */

const SELECTION_DASH: readonly [number, number] = [5, 4];
/** Grip size in CSS pixels; the hit radius in `gestures/tuning.ts` is larger on purpose. */
const HANDLE_SIZE = 9;
const HANDLE_RIM = "rgba(255, 255, 255, 0.92)";
const HANDLE_RIM_WIDTH = 1.5;

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
