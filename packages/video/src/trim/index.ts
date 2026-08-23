/**
 * The trim strip, and the pieces it is made of.
 *
 * The plugin is what a host installs; `track.ts` is the decision it is built on,
 * separated so "where does a handle land" is answerable in a unit test rather
 * than only by dragging one.
 */
export * from "./plugin.js";
export * from "./strip.js";
export * from "./strings.js";
export * from "./track.js";
