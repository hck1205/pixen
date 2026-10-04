/**
 * Scene to draw operations.
 *
 * Split by what each part answers: `types` is the vocabulary, `shapes` and
 * `text` draw the kinds, `layers` places one layer, and `build` puts a whole
 * frame in order. How wide a caption is belongs to the model, not here, so the
 * selection box and the letters cannot disagree. Nothing here touches a canvas.
 */
export * from "./types.js";
export * from "./text.js";
export * from "./shapes.js";
export * from "./layers.js";
export * from "./frames.js";
export * from "./line-ends.js";
export * from "./stroke.js";
export * from "./build.js";
