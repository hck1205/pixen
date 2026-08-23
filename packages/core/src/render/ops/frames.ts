/**
 * A frame as paths, in the space the picture was drawn into.
 *
 * Six treatments, and they are not six variants of one rectangle: corner
 * brackets are eight short lines, a `line` frame is a set of concentric
 * rectangles, and an `edge` frame is four lines that stop short of the corners.
 * Expressing them as a switch inside the canvas executor would have put the
 * geometry of all six inside the one module that is supposed to make no
 * decisions at all — so they are decided here, as data, and the executor
 * strokes whatever it is handed.
 *
 * These are in target space. The builder puts an identity transform in front of
 * them, which is the op list's own way of saying so — the executor already
 * knows what a transform means and needs to learn nothing about frames.
 *
 * Every measurement arrives as a fraction of the region's longest edge and is
 * resolved here, once: a frame that looked right on a preview and wrong on a
 * 6000px export was the bug that made everything else a fraction too.
 */
import { longestEdge } from "../../geometry/rect.js";
import type { Rect } from "../../geometry/types.js";
import type { FrameSettings } from "../../model/types.js";
import type { DrawOp, PathCommand, StrokeStyle } from "./types.js";

/** A frame's fractions, resolved against the region it is drawn around. */
interface FrameMetrics {
  width: number;
  radius: number;
  inset: number;
  offset: number;
  armLength: number;
  count: number;
}

function metricsFor(frame: FrameSettings, region: Rect): FrameMetrics {
  const edge = longestEdge(region);
  return {
    width: Math.max(1, frame.width * edge),
    radius: Math.max(0, frame.radius * edge),
    inset: Math.max(0, frame.inset * edge),
    offset: Math.max(0, frame.offset * edge),
    armLength: Math.max(0, frame.armLength * edge),
    // At least one, or a `line` frame would be a setting that draws nothing.
    count: Math.max(1, Math.round(frame.count)),
  };
}

/** The rectangle a stroke of `width` follows to sit `inset` inside `region`. */
function inside(region: Rect, inset: number, width: number): Rect {
  const offset = inset + width / 2;
  return {
    x: region.x + offset,
    y: region.y + offset,
    width: region.width - offset * 2,
    height: region.height - offset * 2,
  };
}

const line = (from: { x: number; y: number }, to: { x: number; y: number }): PathCommand[] => [
  { op: "move", to: from },
  { op: "line", to },
];

/** Two arms meeting at a corner, pointing along the sides that meet there. */
function bracket(x: number, y: number, dx: number, dy: number, arm: number): PathCommand[] {
  return [
    { op: "move", to: { x: x + dx * arm, y } },
    { op: "line", to: { x, y } },
    { op: "line", to: { x, y: y + dy * arm } },
  ];
}

export function frameOps(frame: FrameSettings, region: Rect): DrawOp[] {
  if (region.width <= 0 || region.height <= 0) return [];
  const metrics = metricsFor(frame, region);
  const stroke: StrokeStyle = { color: frame.colour, width: metrics.width, dash: [] };
  const path = (commands: PathCommand[]): DrawOp => ({ op: "path", commands, stroke });

  switch (frame.style) {
    case "solid":
    case "rounded":
    case "inset": {
      const box = inside(region, frame.style === "inset" ? metrics.inset : 0, metrics.width);
      if (box.width <= 0 || box.height <= 0) return [];
      if (frame.style !== "rounded") return [path([{ op: "rect", rect: box }])];
      // A radius past half the shorter side would make the corners overlap.
      const radius = Math.min(metrics.radius, box.width / 2, box.height / 2);
      return [path([{ op: "round-rect", rect: box, radius }])];
    }

    case "line": {
      // Concentric rectangles, each one `offset` further in than the last.
      const boxes: DrawOp[] = [];
      for (let index = 0; index < metrics.count; index += 1) {
        const box = inside(region, metrics.inset + index * (metrics.offset + metrics.width), metrics.width);
        if (box.width <= 0 || box.height <= 0) break;
        boxes.push(path([{ op: "rect", rect: box }]));
      }
      return boxes;
    }

    case "hook": {
      const box = inside(region, metrics.inset, metrics.width);
      if (box.width <= 0 || box.height <= 0) return [];
      // Never longer than half a side, or the two brackets on a side meet and
      // the frame reads as a rectangle with a gap in it.
      const arm = Math.min(metrics.armLength, box.width / 2, box.height / 2);
      const right = box.x + box.width;
      const bottom = box.y + box.height;
      return [
        path([
          ...bracket(box.x, box.y, 1, 1, arm),
          ...bracket(right, box.y, -1, 1, arm),
          ...bracket(right, bottom, -1, -1, arm),
          ...bracket(box.x, bottom, 1, -1, arm),
        ]),
      ];
    }

    case "edge": {
      const box = inside(region, metrics.inset, metrics.width);
      if (box.width <= 0 || box.height <= 0) return [];
      // Each side is drawn short of both corners, so the four lines float
      // rather than closing into a rectangle.
      const gapX = Math.min(metrics.offset, box.width / 2);
      const gapY = Math.min(metrics.offset, box.height / 2);
      const right = box.x + box.width;
      const bottom = box.y + box.height;
      return [
        path([
          ...line({ x: box.x + gapX, y: box.y }, { x: right - gapX, y: box.y }),
          ...line({ x: right, y: box.y + gapY }, { x: right, y: bottom - gapY }),
          ...line({ x: right - gapX, y: bottom }, { x: box.x + gapX, y: bottom }),
          ...line({ x: box.x, y: bottom - gapY }, { x: box.x, y: box.y + gapY }),
        ]),
      ];
    }
  }
}
