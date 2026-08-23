import { last } from "../../fp/function.js";
import { distance } from "../../geometry/point.js";
import { center } from "../../geometry/rect.js";
import type { EllipseLayer, LineLayer, PathLayer, RectLayer } from "../../model/types.js";
import { lineEndInset, lineEndOps } from "./line-ends.js";
import { toStrokeStyle } from "./stroke.js";
import type { DrawOp, PathCommand } from "./types.js";

/**
 * The four drawn shapes, as path data.
 *
 * Every decision a shape implies — where a corner radius has to stop, how far
 * a shaft yields to what is drawn on its end, which curve a freehand stroke
 * becomes — is made here, so the executor receives geometry and no choices.
 */
export function rectLayerOps(layer: RectLayer): DrawOp[] {
  const radius = Math.min(layer.cornerRadius, layer.frame.width / 2, layer.frame.height / 2);
  const commands: PathCommand[] =
    radius > 0
      ? [{ op: "round-rect", rect: layer.frame, radius }]
      : [{ op: "rect", rect: layer.frame }];

  return [
    {
      op: "path",
      commands,
      ...(layer.fill ? { fill: layer.fill } : {}),
      ...(layer.stroke ? { stroke: toStrokeStyle(layer.stroke) } : {}),
    },
  ];
}

export function ellipseLayerOps(layer: EllipseLayer): DrawOp[] {
  return [
    {
      op: "path",
      commands: [
        {
          op: "ellipse",
          centre: center(layer.frame),
          radiusX: Math.abs(layer.frame.width / 2),
          radiusY: Math.abs(layer.frame.height / 2),
        },
      ],
      ...(layer.fill ? { fill: layer.fill } : {}),
      ...(layer.stroke ? { stroke: toStrokeStyle(layer.stroke) } : {}),
    },
  ];
}

export function lineLayerOps(layer: LineLayer): DrawOp[] {
  const angle = Math.atan2(layer.to.y - layer.from.y, layer.to.x - layer.from.x);
  const length = distance(layer.from, layer.to);

  // The shaft stops short of whatever is drawn on the end, so it does not show
  // through an open decoration — and never short of the middle, or a short line
  // with two decorations would have a shaft running backwards.
  const half = length / 2;
  const startInset = Math.min(lineEndInset(layer.startStyle, layer.stroke.width), half);
  const endInset = Math.min(lineEndInset(layer.endStyle, layer.stroke.width), half);

  return [
    {
      op: "path",
      commands: [
        {
          op: "move",
          to: { x: layer.from.x + Math.cos(angle) * startInset, y: layer.from.y + Math.sin(angle) * startInset },
        },
        { op: "line", to: { x: layer.to.x - Math.cos(angle) * endInset, y: layer.to.y - Math.sin(angle) * endInset } },
      ],
      stroke: toStrokeStyle(layer.stroke),
    },
    // The ends point outwards, away from each other.
    ...lineEndOps(layer.endStyle, layer.to, angle, layer.stroke),
    ...lineEndOps(layer.startStyle, layer.from, angle + Math.PI, layer.stroke),
  ];
}

/**
 * Midpoint-smoothed path. Quadratic segments between sample midpoints stay
 * inside the samples, unlike a spline fit, which overshoots on fast strokes.
 */
export function pathLayerOps(layer: PathLayer): DrawOp[] {
  const points = layer.points;
  if (points.length === 0) return [];

  const first = points[0]!;
  if (points.length === 1) {
    return [
      {
        op: "path",
        commands: [{ op: "circle", centre: first, radius: layer.stroke.width / 2 }],
        fill: layer.stroke.color,
      },
    ];
  }

  const commands: PathCommand[] = [{ op: "move", to: first }];
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i]!;
    const next = points[i + 1]!;
    commands.push({
      op: "quad",
      control: current,
      to: { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 },
    });
  }
  commands.push({ op: "line", to: last(points)! });
  if (layer.closed) commands.push({ op: "close" });

  return [{ op: "path", commands, stroke: toStrokeStyle(layer.stroke) }];
}
