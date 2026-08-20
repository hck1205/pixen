import { delta, distance, midpoint, type Point } from "@pixen/core";
import { PINCH_ZOOM_INTENSITY, WHEEL_ZOOM_INTENSITY } from "./constants.js";

/** Two-finger zoom, and the wheel gesture that stands in for it on a desktop. */
export interface PinchState {
  distance: number;
  centre: Point;
}

export function pinchFrom(a: Point, b: Point): PinchState {
  return { distance: distance(a, b), centre: midpoint(a, b) };
}

/** Zoom factor and pan delta for one pinch step. */
export function pinchStep(previous: PinchState, current: PinchState): { factor: number; delta: Point } {
  return {
    factor: previous.distance > 0 ? current.distance / previous.distance : 1,
    delta: delta(previous.centre, current.centre),
  };
}

/** Wheel and trackpad zoom. Trackpad pinch arrives as ctrl + wheel. */
export function wheelZoomFactor(deltaY: number, ctrlKey: boolean): number {
  const intensity = ctrlKey ? PINCH_ZOOM_INTENSITY : WHEEL_ZOOM_INTENSITY;
  return Math.exp(-deltaY * intensity);
}
