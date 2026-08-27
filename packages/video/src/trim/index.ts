/**
 * The trim strip, and the pieces it is made of.
 *
 * The plugin is what a host installs. Underneath: `track` is what a handle
 * drag means, `mark` is what is kept and what is marked, `strip` is the DOM,
 * and `style` is how it looks — separated so "where does a handle land" is
 * answerable in a unit test rather than only by dragging one.
 *
 * `mark` is named rather than starred: `@pixen/video` re-exports this barrel
 * wholesale, so a star there would publish every helper the control keeps to
 * itself. What a plugin author needs from it is the mark's own type.
 */
export * from "./plugin.js";
export type { TrimMark } from "./mark.js";
export * from "./strip.js";
export * from "./strings.js";
export * from "./style.js";
export * from "./track.js";
