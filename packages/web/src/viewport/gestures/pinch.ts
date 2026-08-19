import type { Point } from "@pixen/core";
import { PINCH_ZOOM_INTENSITY, WHEEL_ZOOM_INTENSITY } from "./constants.js";

/** Two-finger zoom, and the wheel gesture that stands in for it on a desktop. */
export interface PinchState {
  distance: number;
  centre: Point;
}

export function pinchFrom(a: Point, b: Point): PinchState {
  return { distance: Math.hypot(b.x - a.x, b.y - a.y), centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** Zoom factor and pan delta for one pinch step. */
export function pinchStep(previous: PinchState, current: PinchState): { factor: number; delta: Point } {
  return {
    factor: previous.distance > 0 ? current.distance / previous.distance : 1,
    delta: { x: current.centre.x - previous.centre.x, y: current.centre.y - previous.centre.y },
  };
}

/** Wheel and trackpad zoom. Trackpad pinch arrives as ctrl + wheel. */
export function wheelZoomFactor(deltaY: number, ctrlKey: boolean): number {
  const intensity = ctrlKey ? 0.01 : 0.0022;
  return Math.exp(-deltaY * intensity);
}
