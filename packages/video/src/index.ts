/**
 * @pixen/video — trimming and video export for the Pixen editor.
 *
 * The editor does not become a video editor. A video is registered as the
 * source like any other picture, and every existing feature — the crop, the
 * straightening, the adjustments, the annotations — reaches every frame through
 * the scene that was already there. What this package adds is the two things
 * that are genuinely about time: which part is kept, and how it is written out.
 *
 * Read `docs/VIDEO.md` before choosing it. Recording runs at wall-clock speed
 * and writes WebM, both measured, and neither is a footnote.
 */
export * from "./source.js";
export * from "./audio.js";
export * from "./encode.js";
export * from "./export.js";
export * from "./media.js";
export * from "./trim/index.js";
