import type { Point } from "@pixen/core";
import { pinchFrom, pinchStep, type PinchState } from "./gestures/index.js";

/** Two fingers make a pinch; one is a gesture, three is a misgrab. */
export const PINCH_POINTERS = 2;

/**
 * How many fingers are on the canvas, and what the two of them are doing.
 *
 * The gesture reducer is pure and knows nothing about pointer ids; this is the
 * bookkeeping that has to sit beside it — which pointers are down, where they
 * were last, and what zoom and pan the distance between two of them asks for.
 * It lived as two fields and two methods in the viewport, where multi-touch was
 * answerable only on a device with two fingers to spare.
 */
export class TouchPoints {
  readonly #points = new Map<number, Point>();
  #pinch: PinchState | null = null;

  get count(): number {
    return this.#points.size;
  }

  /** True once `beginPinch` has been called and both fingers are still down. */
  get pinching(): boolean {
    return this.#pinch !== null;
  }

  down(id: number, point: Point): void {
    this.#points.set(id, point);
  }

  /** Moves a pointer already down; an unknown one is ignored. */
  move(id: number, point: Point): void {
    if (this.#points.has(id)) this.#points.set(id, point);
  }

  up(id: number): void {
    this.#points.delete(id);
    // A pinch needs both fingers. Losing one ends it rather than letting the
    // remaining finger drag the picture by the distance the other one left.
    if (this.#points.size < PINCH_POINTERS) this.#pinch = null;
  }

  cancel(): void {
    this.#points.clear();
    this.#pinch = null;
  }

  /** Starts measuring from where the two fingers are now. */
  beginPinch(): void {
    this.#pinch = this.#between();
  }

  /**
   * The zoom and pan this step of the pinch asks for, or null when there is no
   * pinch to step. Advances the baseline, so each call is one step.
   */
  step(): { factor: number; delta: Point; centre: Point } | null {
    const previous = this.#pinch;
    const current = previous && this.#between();
    if (!previous || !current) return null;

    this.#pinch = current;
    return { ...pinchStep(previous, current), centre: current.centre };
  }

  #between(): PinchState | null {
    const [a, b] = [...this.#points.values()];
    return a && b ? pinchFrom(a, b) : null;
  }
}
