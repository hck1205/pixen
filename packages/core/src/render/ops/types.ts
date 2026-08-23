import type { Matrix, Point, Rect } from "../../geometry/types.js";
import type { Adjustments, RedactionMode } from "../../model/types.js";

/**
 * Drawing, expressed as data.
 *
 * The renderer used to decide *and* draw in the same statement, which put every
 * decision — where an arrow head goes, how text wraps, whether a rotation is
 * applied around the right centre — behind a canvas context and out of reach of
 * a unit test. Building an op list first splits the two: the builders are pure
 * and fully testable in node, and `canvas2d/` is a small executor with no
 * decisions left in it.
 *
 * This module is the vocabulary alone — what may be said, not who says it.
 */
export type PathCommand =
  | { op: "move"; to: Point }
  | { op: "line"; to: Point }
  | { op: "quad"; control: Point; to: Point }
  | { op: "rect"; rect: Rect }
  | { op: "round-rect"; rect: Rect; radius: number }
  | { op: "ellipse"; centre: Point; radiusX: number; radiusY: number }
  | { op: "circle"; centre: Point; radius: number }
  | { op: "close" };

export interface StrokeStyle {
  color: string;
  width: number;
  dash: number[];
}

export interface TextBackground {
  rect: Rect;
  color: string;
}

export type DrawOp =
  | {
      op: "layer-image";
      source: CanvasImageSource;
      frame: Rect;
      /** Tiles the bitmap at its natural size instead of stretching it. */
      repeat: boolean;
    }
  | {
      /**
       * Hides what is already on the canvas inside `frame`.
       *
       * The executor reads the pixels back, which is why this is an operation
       * rather than a shape: the effect depends on what was drawn before it.
       */
      op: "obscure";
      frame: Rect;
      mode: RedactionMode;
      /** Blur radius or block size, in image-space units. */
      strength: number;
      /** Used by `solid`, and whenever the pixels cannot be read back. */
      colour: string;
      /**
       * Fixes the block order `scramble` uses. Derived from the layer, never
       * from the moment of drawing: a preview that differs from the exported
       * file is a bug, and both are rendered from the same document.
       */
      seed: number;
    }
  | { op: "clear"; width: number; height: number }
  | { op: "fill-viewport"; color: string; width: number; height: number }
  | {
      /** A soft darkening towards the corners, drawn over the image. */
      op: "vignette";
      rect: Rect;
      /** 0 leaves the image alone; 1 is the strongest fall-off offered. */
      strength: number;
    }
  | { op: "filter"; value: string }
  | { op: "transform"; matrix: Matrix }
  | { op: "alpha"; value: number }
  | { op: "image"; source: CanvasImageSource; width: number; height: number }
  | { op: "path"; commands: PathCommand[]; stroke?: StrokeStyle; fill?: string }
  | {
      op: "text";
      lines: string[];
      origin: Point;
      lineHeight: number;
      font: string;
      align: "left" | "center" | "right";
      color: string;
      background?: TextBackground;
    }
  | { op: "adjust-pixels"; adjustments: Adjustments; width: number; height: number };

/** Measures a string in a given CSS font. Injected so text layout is testable. */
export type TextMeasurer = (text: string, font: string) => number;

export interface BuildOptions {
  /** False when the engine lacks canvas `filter`, which switches to the pixel path. */
  contextFilter?: boolean;
  measureText?: TextMeasurer;
  clear?: boolean;
  skipLayers?: boolean;
}
