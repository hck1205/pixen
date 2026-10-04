/**
 * Executing a draw-operation list on a Canvas2D context.
 *
 * `execute` holds the switch and nothing else. Each neighbour holds one kind of
 * drawing along with the engine fallback that kind needs: `paths` and `text`
 * for the annotations, `images` for the bitmaps that are not the picture,
 * `pixels` for the three operations that read the canvas back, `decoration` for
 * what shades by position, and `redaction` for what has to destroy what it
 * covers.
 */
export * from "./execute.js";
export { obscureStrength } from "./redaction.js";
