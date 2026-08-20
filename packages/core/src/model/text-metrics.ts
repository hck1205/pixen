/**
 * How text occupies space, before anything measures it for real.
 *
 * Three places need these numbers: the renderer, which lays a caption out; the
 * model, which estimates a text layer's bounds for hit testing; and the
 * on-canvas editor, which puts a real `<textarea>` over the layer being typed
 * into. Each had its own copy, and they disagreed — the renderer spaced lines
 * at 1.25 while the other two used 1.2, the second of them under a comment
 * saying it matched the renderer. It did not, so a multi-line caption was typed
 * at one spacing and drawn at another, and its hit box was short.
 *
 * One home, so they cannot drift apart again.
 */

/** Baseline-to-baseline distance, as a multiple of the font size. */
export const LINE_HEIGHT_RATIO = 1.25;

/**
 * Width of an average character, as a fraction of the font size.
 *
 * Only ever a fallback. Where a canvas is available its own `measureText` is
 * used instead, because a proportional font makes any single ratio wrong for
 * every particular string — this is for layout in a worker, in a test, and
 * before the first frame.
 */
export const AVERAGE_GLYPH_RATIO = 0.55;
