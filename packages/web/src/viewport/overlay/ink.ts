import type { Segment } from "./geometry.js";

/**
 * What both halves of the overlay draw with.
 *
 * Everything else — the scrim's overshoot, the dash of a selection, the size of
 * a grip — belongs to only one of them and lives beside it. What is here is the
 * line weight they share and the one stroke they both make.
 *
 * Measurements are in CSS pixels, multiplied by the device pixel ratio where
 * they are used, so a line is the same thickness on a retina screen as a plain
 * one.
 */

/** The outline weight, for the crop frame and the selection box alike. */
export const OUTLINE_WIDTH = 1.5;

/** Strokes a run of segments as one path. */
export function strokeSegments(
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
