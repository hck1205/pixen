/**
 * What sits at the end of a line.
 *
 * Its own module for the same reason `clip.ts` is: it is a small vocabulary
 * with a rule attached, and the document's type file is a list of shapes rather
 * than a place to explain one of them.
 *
 * Eight rather than a boolean, because a line means different things at each
 * end: an arrow points, a bar measures, a circle marks a spot, a square marks a
 * corner. The open and solid pairs are the same shape drawn stroked or filled,
 * which is a real distinction over a busy photograph — and the one that decides
 * how far the shaft stops short, since a solid decoration hides what is under
 * it and an open one does not.
 */
export const LINE_ENDS = [
  "none",
  "bar",
  "arrow",
  "arrow-solid",
  "circle",
  "circle-solid",
  "square",
  "square-solid",
] as const;

export type LineEnd = (typeof LINE_ENDS)[number];
