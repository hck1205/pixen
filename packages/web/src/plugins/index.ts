/**
 * Plugins: a function called once with everything it may touch.
 *
 * The types say what a plugin may contribute; the registry holds what it did,
 * as data the chrome reads. Neither knows about the other's internals, which is
 * what keeps "what does the chrome show" answerable without running a plugin.
 */
export * from "./types.js";
export * from "./registry.js";
