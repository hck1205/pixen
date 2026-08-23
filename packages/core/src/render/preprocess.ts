/**
 * The host's chance to rewrite a shape before it is drawn.
 *
 * Everything the editor draws on top of a picture is a layer, and a layer is
 * data — so between "what is stored" and "what is drawn" there is room for the
 * host to say something. A processor takes one layer and returns the layers to
 * draw in its place: none, itself, or several.
 *
 * What it is *for* is the part worth stating. It is not a render hook: it never
 * sees a canvas and cannot draw. It is a rule about shapes — snap this
 * rectangle to a grid, give every layer carrying a marker its house style,
 * expand one annotation into a callout of three, hide a placeholder in the
 * exported file but not on screen.
 *
 * Two rules make it safe. It runs over a *copy* on the way to the renderer, so
 * the stored document is untouched and undo still means what it said. And it
 * is told whether this is the preview or the file, because "not in the export"
 * and "not on screen" are both things a host wants to say.
 */
import type { EditorLayer } from "../model/types.js";

export interface PreprocessContext {
  /** True while drawing the editor's own view, false while writing a file. */
  preview: boolean;
  /** The turn and the flips the picture is under, for a shape that cares. */
  transform: { rotation: number; flipX: boolean; flipY: boolean };
  /** Drawn pixels per image pixel, for a processor sizing something to the view. */
  scale: number;
}

/**
 * One rule. Returning `undefined` means "not mine" — which is what lets a host
 * hand over a list of narrow processors rather than one that has to recognise
 * everything.
 */
export type ShapeProcessor = (
  layer: EditorLayer,
  context: PreprocessContext,
) => EditorLayer[] | undefined;

/**
 * Runs the chain over one layer.
 *
 * The first processor that claims the layer decides what it becomes, and the
 * rest of the chain then runs over each of *those* — so a processor that
 * expands a shape can hand its parts to the ones after it, and a processor that
 * would claim its own output has to say so by not claiming it twice. That is
 * the same rule a middleware chain has, and the alternative — running every
 * processor over the original and concatenating — silently doubles a shape the
 * moment two of them match it.
 */
export function preprocessLayer(
  layer: EditorLayer,
  processors: readonly ShapeProcessor[],
  context: PreprocessContext,
): EditorLayer[] {
  if (processors.length === 0) return [layer];

  const [first, ...rest] = processors;
  const claimed = first!(layer, context);
  if (claimed === undefined) return preprocessLayer(layer, rest, context);
  return claimed.flatMap((produced) => preprocessLayer(produced, rest, context));
}

/** The chain over a whole document's worth of layers, in order. */
export function preprocessLayers(
  layers: readonly EditorLayer[],
  processors: readonly ShapeProcessor[],
  context: PreprocessContext,
): EditorLayer[] {
  if (processors.length === 0) return [...layers];
  return layers.flatMap((layer) => preprocessLayer(layer, processors, context));
}
