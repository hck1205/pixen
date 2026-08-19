import {
  DEFAULT_ANNOTATION_COLOUR,
  DEFAULT_FONT_RATIO,
  DEFAULT_STROKE_RATIO,
  type Stroke,
} from "@pixen/core";

/**
 * How new annotations look, and how that scales.
 *
 * Widths and font sizes are stored as a fraction of the image's longest edge, so
 * an annotation drawn on an 800px photo and one drawn on an 8000px photo look
 * the same to the person drawing them.
 */
export interface AnnotationStyle {
  colour: string;
  /** Stroke width as a fraction of the image's longest edge, so annotations
   * look the same on a 800px and a 8000px source. */
  widthRatio: number;
  fontRatio: number;
}

export const DEFAULT_STYLE: AnnotationStyle = {
  colour: DEFAULT_ANNOTATION_COLOUR,
  widthRatio: DEFAULT_STROKE_RATIO,
  fontRatio: DEFAULT_FONT_RATIO,
};

export function strokeFor(style: AnnotationStyle, imageLongestEdge: number): Stroke {
  return { color: style.colour, width: Math.max(1, imageLongestEdge * style.widthRatio) };
}

export function fontSizeFor(style: AnnotationStyle, imageLongestEdge: number): number {
  return Math.max(8, imageLongestEdge * style.fontRatio);
}
