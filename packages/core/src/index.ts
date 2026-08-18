/**
 * @pixen/core — the headless image editing engine.
 *
 * Layering, from the bottom up: geometry, the serialisable document model,
 * runtime resources, the engine (commands, history, transactions), the scene and
 * its Canvas2D renderer, and the export pipeline. Nothing in this package
 * touches the DOM beyond canvas, so it runs in a page, in a worker, and in tests.
 */
export * from "./errors/index.js";
export * from "./geometry/index.js";
export * from "./model/index.js";
export * from "./resources/index.js";
export * from "./image/index.js";
export * from "./render/index.js";
export * from "./engine/index.js";
export * from "./export/index.js";
export { Emitter, type Unsubscribe } from "./util/emitter.js";
export { deepClone } from "./util/clone.js";
export { createId } from "./util/id.js";

export const VERSION = "0.1.0";
