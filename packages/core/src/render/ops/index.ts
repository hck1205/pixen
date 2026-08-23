/**
 * Scene to draw operations.
 *
 * Split by what each part answers: `types` is the vocabulary, `text` lays text
 * out, `layers` turns one layer into operations, and `build` puts a whole frame
 * in order. Nothing here touches a canvas.
 */
export * from "./types.js";
export * from "./text.js";
export * from "./layers.js";
export * from "./frames.js";
export * from "./line-ends.js";
export * from "./stroke.js";
export * from "./build.js";
