import {
  COMPACT_FALLBACK_MAX_WIDTH,
  COMPACT_MAX_HEIGHT,
  COMPACT_MAX_WIDTH,
} from "../../viewport/view.js";

/**
 * The compact layout: the rail lies down under the image and the inspector
 * spans the width.
 *
 * The rules are written once and used twice. A container query is the right
 * question — an editor can be 360px wide inside a 1400px page, and a viewport
 * query would dress it as a desktop — but engines without container queries
 * need a viewport media query as a rough stand-in, and CSS cannot share a block
 * between the two. Interpolating one constant can, which matters because the
 * two hand-written copies had already drifted: one carried a stray duplicate of
 * the text editor's rules, and `.middle` was spelled differently in each.
 *
 * The breakpoints come from `view.ts`, which is also where `insetsFor()` fits
 * the image into whatever space this leaves. They used to be written out here
 * as well, under a pair of comments — one in each file — saying the two had to
 * stay in step. Neither could make it so; interpolation can.
 */
const COMPACT = `
  .layer { padding: 8px; gap: 8px; }
  .middle { align-items: flex-end; justify-content: center; min-inline-size: 0; }
  .rail { flex-direction: row; max-inline-size: 100%; min-inline-size: 0; }
  .rail .group-start { margin-block-start: 0; margin-inline-start: 8px; }
  .inspector { max-inline-size: 100%; inline-size: 100%; }
  .bottom { align-items: stretch; }
  .bottom .cluster { inline-size: 100%; border-radius: var(--pixen-radius); }
`;

/**
 * The media fallback is written first so the container rule wins wherever both
 * apply. Note the `or` in the container condition: a container query is a
 * single query, not the comma-separated list `@media` accepts, and a comma
 * there silently drops the whole block.
 */
export const responsive = `
@media (max-width: ${COMPACT_FALLBACK_MAX_WIDTH}px) {${COMPACT}}

@container (max-width: ${COMPACT_MAX_WIDTH}px) or (max-height: ${COMPACT_MAX_HEIGHT}px) {${COMPACT}}

@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
}
`;
