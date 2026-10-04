/**
 * What sits at the end of a line, as geometry.
 *
 * Each decoration is drawn at a tip, pointing outwards along the shaft, and
 * says how far the shaft has to be pulled back so it does not poke through
 * whatever was drawn there. Both are pure functions of the tip, the angle and
 * the stroke — no canvas, no layer, no document — which is why "does a solid
 * circle sit on the tip or beside it" is answerable in a unit test.
 *
 * The sizes are multiples of the stroke width rather than absolutes, for the
 * same reason every other annotation measurement is: an arrow head that is six
 * pixels on a thumbnail and six pixels on a 6000px export is a different
 * drawing at each size.
 */
import type { Point } from "../../geometry/types.js";
import type { LineEnd, Stroke } from "../../model/types.js";
import type { DrawOp, PathCommand } from "./types.js";
import { toStrokeStyle } from "./stroke.js";

/** Half the angle between an arrow's two barbs. */
const ARROW_SPREAD = Math.PI / 7;
/**
 * Arrow head length, as a multiple of the stroke width.
 *
 * Unchanged from when the head was the only decoration there was: a migration
 * that restyled every arrow in a customer's archive would be a worse bug than
 * the one it fixed.
 */
const ARROW_HEAD_RATIO = 3.5;
/**
 * How far into an arrow head the shaft may run, as a fraction of the head.
 *
 * Not all the way: the head's two barbs meet the shaft short of the point, so a
 * shaft drawn to the tip pokes out between them on a thick stroke.
 */
const ARROW_SHAFT_OVERLAP = 0.8;

/** Radius of a circle end, and half the side of a square, as multiples of it. */
const MARK_RADIUS_RATIO = 2;
/** Half the length of a bar, across the shaft. */
const BAR_RATIO = 2.5;

/**
 * How far the shaft stops short of the tip.
 *
 * A solid decoration hides what is under it, so the shaft may run all the way
 * in; an open one does not, so the shaft would show through its middle and out
 * the far side. That is the whole difference, and it is why this is a function
 * of the style rather than a constant.
 */
export function lineEndInset(style: LineEnd, width: number): number {
  switch (style) {
    case "arrow":
    case "arrow-solid":
      return width * ARROW_HEAD_RATIO * ARROW_SHAFT_OVERLAP;
    case "circle":
    case "circle-solid":
    case "square":
    case "square-solid":
      return width * MARK_RADIUS_RATIO;
    case "bar":
    case "none":
      return 0;
  }
}

function arrowCommands(tip: Point, angle: number, length: number): PathCommand[] {
  const barb = (spread: number): Point => ({
    x: tip.x - Math.cos(angle + spread) * length,
    y: tip.y - Math.sin(angle + spread) * length,
  });
  return [
    { op: "move", to: barb(-ARROW_SPREAD) },
    { op: "line", to: tip },
    { op: "line", to: barb(ARROW_SPREAD) },
  ];
}

/** A square standing on the shaft, so it reads as a corner rather than a diamond. */
function squareCommands(tip: Point, angle: number, half: number): PathCommand[] {
  const corner = (along: number, across: number): Point => ({
    x: tip.x + Math.cos(angle) * along - Math.sin(angle) * across,
    y: tip.y + Math.sin(angle) * along + Math.cos(angle) * across,
  });
  return [
    { op: "move", to: corner(-half, -half) },
    { op: "line", to: corner(half, -half) },
    { op: "line", to: corner(half, half) },
    { op: "line", to: corner(-half, half) },
    { op: "close" },
  ];
}

/**
 * The decoration at one end.
 *
 * `angle` points outwards — away from the other end — so the same function
 * draws both ends and the caller does the turning.
 */
export function lineEndOps(style: LineEnd, tip: Point, angle: number, stroke: Stroke): DrawOp[] {
  const outline = toStrokeStyle(stroke);
  const radius = stroke.width * MARK_RADIUS_RATIO;

  switch (style) {
    case "none":
      return [];
    case "bar": {
      const half = stroke.width * BAR_RATIO;
      const across = (sign: number): Point => ({
        x: tip.x - Math.sin(angle) * half * sign,
        y: tip.y + Math.cos(angle) * half * sign,
      });
      return [
        {
          op: "path",
          commands: [{ op: "move", to: across(-1) }, { op: "line", to: across(1) }],
          stroke: outline,
        },
      ];
    }
    case "arrow":
      return [
        {
          op: "path",
          commands: arrowCommands(tip, angle, stroke.width * ARROW_HEAD_RATIO),
          stroke: outline,
        },
      ];
    case "arrow-solid":
      return [
        {
          op: "path",
          commands: [...arrowCommands(tip, angle, stroke.width * ARROW_HEAD_RATIO), { op: "close" }],
          fill: stroke.color,
        },
      ];
    case "circle":
      return [{ op: "path", commands: [{ op: "circle", centre: tip, radius }], stroke: outline }];
    case "circle-solid":
      return [{ op: "path", commands: [{ op: "circle", centre: tip, radius }], fill: stroke.color }];
    case "square":
      return [{ op: "path", commands: squareCommands(tip, angle, radius), stroke: outline }];
    case "square-solid":
      return [{ op: "path", commands: squareCommands(tip, angle, radius), fill: stroke.color }];
  }
}
