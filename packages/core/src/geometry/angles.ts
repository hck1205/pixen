/**
 * Angle arithmetic.
 *
 * Radians everywhere inside Pixen, because that is what the maths and the
 * canvas take; degrees only at the edges, where a person reads a number. Both
 * conversions and the two turns that keep appearing lived in four different
 * files — `Math.PI / 2` was declared twice and inlined a third time — which is
 * three copies of a fact that has one value.
 *
 * There are two ways to normalise an angle and they are not interchangeable, so
 * each says in its name which range it lands in.
 */
export const QUARTER_TURN = Math.PI / 2;

/** Internal: the two folds below are the only things a whole turn is needed for. */
const FULL_TURN = Math.PI * 2;

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Folds into (-π, π], so a saved rotation never grows without bound and a
 * quarter turn left reads as -90° rather than 270°.
 */
export function normaliseAngle(radians: number): number {
  const folded = radians % FULL_TURN;
  if (folded > Math.PI) return folded - FULL_TURN;
  if (folded <= -Math.PI) return folded + FULL_TURN;
  return folded;
}

/**
 * Folds into [0, 2π), which is what a comparison against a quarter turn wants:
 * the document's transform is stored as a positive rotation.
 */
export function positiveAngle(radians: number): number {
  const folded = radians % FULL_TURN;
  return folded < 0 ? folded + FULL_TURN : folded;
}
