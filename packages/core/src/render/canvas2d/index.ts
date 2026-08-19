/**
 * Executing a draw-operation list on a Canvas2D context.
 *
 * `execute` holds the switch; `redaction` and `decoration` hold the two kinds
 * of operation that need more than a single canvas call — the ones that read
 * pixels back, and the ones that shade by position.
 */
export * from "./execute.js";
