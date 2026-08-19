import { applyToPoint, invert, type Point } from "@pixen/core";
import type { GestureContext } from "./types.js";

/**
 * Screen, stage and image are three different spaces, and a single drag crosses
 * all three. Every conversion goes through here.
 */
export function screenToStage(context: GestureContext, point: Point): Point {
  return applyToPoint(invert(context.viewMatrix), point);
}

export function stageToScreen(context: GestureContext, point: Point): Point {
  return applyToPoint(context.viewMatrix, point);
}

export function screenToImage(context: GestureContext, point: Point): Point {
  return applyToPoint(invert(context.stageFromImage), screenToStage(context, point));
}
