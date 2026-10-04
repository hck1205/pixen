/**
 * Pointer gestures as a pure state machine.
 *
 * What a drag *means* — which handle it grabbed, whether the shape it drew is
 * big enough to keep, when a transaction opens and closes — lives here rather
 * than in DOM event handlers, so it is covered by ordinary unit tests and the
 * viewport is left holding nothing but event plumbing.
 *
 * The tuning constants stay internal: they are feel, not API.
 */
export * from "./types.js";
export * from "./coordinates.js";
export * from "./hit-testing.js";
export * from "./shapes.js";
export * from "./effects.js";
export * from "./begin.js";
export * from "./transitions.js";
export * from "./pinch.js";
