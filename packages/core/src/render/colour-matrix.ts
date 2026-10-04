/**
 * A colour transform a host wrote, rather than one we named.
 *
 * The twelve adjustments are a vocabulary: exposure, contrast, saturation and
 * the rest, each a slider a person understands. A brand look is not in that
 * vocabulary — a film emulation, a house grade, a duotone keyed to two brand
 * colours are all one matrix and none of them is a slider — and a product that
 * only offers the words we thought of is a product somebody has to fork.
 *
 * Twenty numbers, four rows of five, in the order the platform's own colour
 * matrices use: each output channel is a weighted sum of the four inputs plus a
 * constant, and the constant is a fraction of full scale rather than of 255, so
 * a matrix copied from a stylesheet or an SVG filter means here what it meant
 * there.
 *
 *   r' = m0·r  + m1·g  + m2·b  + m3·a  + m4
 *   g' = m5·r  + m6·g  + m7·b  + m8·a  + m9
 *   b' = m10·r + m11·g + m12·b + m13·a + m14
 *   a' = m15·r + m16·g + m17·b + m18·a + m19
 */

/** Rows, columns, and the length that follows from them. */
const ROWS = 4;
const COLUMNS = 5;
export const COLOUR_MATRIX_LENGTH = ROWS * COLUMNS;

/** Channels in the buffer, which is also the number of rows. */
const CHANNELS = 4;

/** Full scale for one channel, which the constant column is a fraction of. */
const FULL_SCALE = 255;

/** Leaves every colour exactly as it was. */
export const IDENTITY_COLOUR_MATRIX: readonly number[] = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/** Whether twenty finite numbers is what arrived. */
export function isColourMatrix(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) && value.length === COLOUR_MATRIX_LENGTH && value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Whether applying this matrix would change anything.
 *
 * A pass over every pixel of a 48-megapixel photograph is not something to do
 * for nothing, which is the same reason the named adjustments answer this
 * question before running.
 */
export function isIdentityColourMatrix(matrix: readonly number[]): boolean {
  return matrix.every((value, index) => value === IDENTITY_COLOUR_MATRIX[index]);
}

/**
 * Applies the matrix in place. Returns whether anything changed.
 *
 * Not premultiplied: the arithmetic is over the channels as they are stored,
 * which is what a matrix written for a stylesheet or an SVG filter expects.
 */
export function applyColourMatrix(pixels: Uint8ClampedArray, matrix: readonly number[]): boolean {
  if (!isColourMatrix(matrix) || isIdentityColourMatrix(matrix)) return false;

  for (let at = 0; at < pixels.length; at += CHANNELS) {
    const r = pixels[at]!;
    const g = pixels[at + 1]!;
    const b = pixels[at + 2]!;
    const a = pixels[at + 3]!;
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      const row = channel * COLUMNS;
      pixels[at + channel] =
        matrix[row]! * r +
        matrix[row + 1]! * g +
        matrix[row + 2]! * b +
        matrix[row + 3]! * a +
        matrix[row + 4]! * FULL_SCALE;
    }
  }
  return true;
}
