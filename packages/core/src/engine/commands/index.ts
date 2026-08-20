/**
 * Every document mutation, as a pure function.
 *
 * The engine, the headless API and the tests all call these, so "what does
 * rotate do to a crop" has exactly one answer in the codebase. They are grouped
 * by what they change: the frame the picture sits in, the layers drawn on it,
 * and the document's own settings.
 */
export * from "./frame.js";
export * from "./layers.js";
export * from "./document.js";
