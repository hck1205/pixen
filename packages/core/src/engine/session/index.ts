/**
 * Editing as pure data and pure functions.
 *
 * `intents` is the vocabulary — every edit the engine understands, and the
 * command each one stands for. `reduce` is the machine that applies one, with
 * the history and selection rules that go with it.
 */
export * from "./intents.js";
export * from "./reduce.js";
