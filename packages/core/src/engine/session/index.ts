/**
 * Editing as pure data and pure functions.
 *
 * `intents` is the vocabulary — every edit the engine understands and what each
 * one carries. `commands-for` says what each one does. `steps` is how a step is
 * named in the undo stack. `reduce` is the machine that applies one, with the
 * history and selection rules that go with it.
 */
export * from "./intents.js";
export * from "./commands-for.js";
export * from "./steps.js";
export * from "./reduce.js";
