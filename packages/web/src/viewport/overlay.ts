import { CROP_HANDLES, type CropHandle, type Point, type Rect } from "@pixen/core";
import type { ToolId } from "../tools/index.js";

/**
 * The overlay as data, not as drawing calls: what to draw over the picture, and
 * where its lines go.
 *
 * Keeping both here means the rule-of-thirds spacing, the corner bracket
 * lengths and "which overlay does this state call for" are all answerable in a
 * unit test, and the viewport is left with a loop over line segments.
 */
export interface Segment {
  from: Point;
  to: Point;
}

/** Rule-of-thirds guides inside `rect`. */
export function gridSegments(rect: Rect, divisions = 3): Segment[] {
  const segments: Segment[] = [];
  for (let i = 1; i < divisions; i += 1) {
    const x = rect.x + (rect.width * i) / divisions;
    const y = rect.y + (rect.height * i) / divisions;
    segments.push({ from: { x, y: rect.y }, to: { x, y: rect.y + rect.height } });
    segments.push({ from: { x: rect.x, y }, to: { x: rect.x + rect.width, y } });
  }
  return segments;
}

export const CORNER_ARM = 22;

/**
 * Corner brackets: two arms per corner, pointing inwards. The arm is capped at a
 * third of the rect so the brackets never meet on a small crop.
 */
export function cornerSegments(rect: Rect, arm = CORNER_ARM): Segment[] {
  const length = Math.min(arm, rect.width / 3, rect.height / 3);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  const corners: Array<{ point: Point; dx: number; dy: number }> = [
    { point: { x: rect.x, y: rect.y }, dx: 1, dy: 1 },
    { point: { x: right, y: rect.y }, dx: -1, dy: 1 },
    { point: { x: right, y: bottom }, dx: -1, dy: -1 },
    { point: { x: rect.x, y: bottom }, dx: 1, dy: -1 },
  ];

  return corners.flatMap(({ point, dx, dy }) => [
    { from: { x: point.x + length * dx, y: point.y }, to: point },
    { from: point, to: { x: point.x, y: point.y + length * dy } },
  ]);
}

/** Maps a stage-space rect into device pixels through the view transform. */
export function projectRect(
  rect: Rect,
  toScreen: (point: Point) => Point,
  devicePixelRatio: number,
): Rect {
  const topLeft = toScreen({ x: rect.x, y: rect.y });
  const bottomRight = toScreen({ x: rect.x + rect.width, y: rect.y + rect.height });
  return {
    x: topLeft.x * devicePixelRatio,
    y: topLeft.y * devicePixelRatio,
    width: (bottomRight.x - topLeft.x) * devicePixelRatio,
    height: (bottomRight.y - topLeft.y) * devicePixelRatio,
  };
}

/**
 * What the overlay is, for the state the editor is in.
 *
 * A pure lookup, like `inspectorSectionFor` next door: the crop tool owns the
 * canvas while it is armed, whatever else is selected, and everything else
 * shows the selected layer or nothing at all.
 */
export type OverlayPlan =
  | { kind: "crop" }
  | { kind: "selection"; grips: readonly CropHandle[]; rotate: boolean }
  | { kind: "none" };

export function planOverlay(tool: ToolId, selected: { locked: boolean } | null): OverlayPlan {
  if (tool === "crop") return { kind: "crop" };
  if (!selected) return { kind: "none" };
  // A locked layer still shows where it is; it just cannot be grabbed, so it
  // gets the outline and none of the things you would drag.
  if (selected.locked) return { kind: "selection", grips: [], rotate: false };
  return { kind: "selection", grips: CROP_HANDLES, rotate: true };
}
