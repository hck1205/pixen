import {
  clampSelection,
  wholeClip,
  type ClipBounds,
  type ClipRange,
  type ClipSelection,
  type Editor,
} from "@pixen/core";

/**
 * What the strip is showing, and where the handles are.
 *
 * Two questions the DOM next door asks constantly and answers nowhere: which
 * parts are kept, and which stretch is marked. Neither is a drawing, and the
 * second outlives every rebuild of the control that draws it.
 */
/**
 * What the strip is showing as kept.
 *
 * A document with no clip means the whole source — but under a ceiling the
 * whole source is not something the host will take, so what is drawn is the
 * longest clip the rule allows. Showing three seconds kept under a one-second
 * rule would be an interface disagreeing with itself before anyone touched it.
 */
export function keptParts(editor: Editor, duration: number, bounds: ClipBounds): ClipSelection {
  return clampSelection(editor.document.clip ?? [wholeClip(duration)], duration, bounds);
}

/**
 * Where the handles are, which outlives a rebuild.
 *
 * The section is rebuilt whenever the document changes, so the mark cannot live
 * in the DOM it is drawn into. It belongs to the installed plugin, which is the
 * thing whose lifetime matches how long the strip is on screen.
 */
export interface TrimMark {
  range: ClipRange | null;
  /** Undoes what the last build subscribed to. See `buildTrimStrip`. */
  release?: () => void;
}

export function markedRange(mark: TrimMark, kept: ClipSelection): ClipRange {
  return mark.range ?? { start: kept[0]!.start, end: kept[kept.length - 1]!.end };
}

