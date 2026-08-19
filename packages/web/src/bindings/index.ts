/**
 * What a framework wrapper needs and nothing else.
 *
 * `@pixen/react` and `@pixen/vue` are thin because this module carries the parts
 * that would otherwise be copied into each of them; a new wrapper starts here.
 */
export * from "./events.js";
export * from "./properties.js";
