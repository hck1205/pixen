/**
 * Everything drawn over the picture rather than in it.
 *
 * Split by what each part answers: `plan` decides which overlay the editor's
 * state calls for, `geometry` says where its lines go, `palette` what colour
 * they are, `crop` and `selection` draw the two things it can be, and `draw`
 * puts one frame of it together.
 */
export * from "./plan.js";
export * from "./geometry.js";
export * from "./palette.js";
export * from "./draw.js";
