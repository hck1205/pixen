import { applyToPoint, meanScale, type Matrix, type TextLayer } from "@pixen/core";

/**
 * Where an on-canvas text editor has to sit to look like the text it replaces.
 *
 * Editing text in a panel while it renders on the canvas is two places to look
 * at once. Putting a real input over the layer means the answer to "where, how
 * big, how turned" is geometry — so it lives here as a pure function, with the
 * DOM left holding nothing but the assignment of the numbers.
 */
export interface TextBoxPlacement {
  /** CSS pixels relative to the canvas. */
  left: number;
  top: number;
  fontSize: number;
  lineHeight: number;
  /** Radians, turned about `origin` — the same centre the renderer turns about. */
  rotation: number;
  origin: { x: number; y: number };
  fontFamily: string;
  color: string;
  align: TextLayer["align"];
  /** Wrapping column in CSS pixels, or null when the layer does not wrap. */
  maxWidth: number | null;
}

/** Matches the renderer's line spacing, or the caret would drift down a paragraph. */
export const LINE_HEIGHT_RATIO = 1.2;

/** Enough room to see a caret in an empty layer. */
export const MIN_TEXT_BOX_WIDTH = 24;

export function textBoxPlacement(layer: TextLayer, imageToScreen: Matrix): TextBoxPlacement {
  const scale = Math.abs(meanScale(imageToScreen));
  const topLeft = applyToPoint(imageToScreen, layer.position);
  const fontSize = Math.max(1, layer.fontSize * scale);

  // The renderer turns a text layer about the centre of the box it lays out, so
  // the editor has to turn about the same point rather than about its corner.
  const lines = layer.text.split("\n");
  const width = layer.maxWidth ?? Math.max(...lines.map((line) => line.length)) * layer.fontSize * 0.55;
  const height = lines.length * layer.fontSize * LINE_HEIGHT_RATIO;

  return {
    left: topLeft.x,
    top: topLeft.y,
    fontSize,
    lineHeight: fontSize * LINE_HEIGHT_RATIO,
    rotation: layer.rotation,
    origin: { x: (width / 2) * scale, y: (height / 2) * scale },
    fontFamily: layer.fontFamily,
    color: layer.color,
    align: layer.align,
    maxWidth: layer.maxWidth === null ? null : Math.max(MIN_TEXT_BOX_WIDTH, layer.maxWidth * scale),
  };
}

/** The inline style an editor element needs to sit exactly over the layer. */
export function textBoxStyle(placement: TextBoxPlacement): Record<string, string> {
  return {
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    "font-size": `${placement.fontSize}px`,
    "line-height": `${placement.lineHeight}px`,
    "font-family": placement.fontFamily,
    color: placement.color,
    "text-align": placement.align,
    width: placement.maxWidth === null ? "auto" : `${placement.maxWidth}px`,
    "min-width": `${MIN_TEXT_BOX_WIDTH}px`,
    "transform-origin": `${placement.origin.x}px ${placement.origin.y}px`,
    transform: placement.rotation ? `rotate(${placement.rotation}rad)` : "none",
  };
}
