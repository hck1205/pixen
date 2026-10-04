import type { Canvas2D } from "../../image/canvas.js";
import type { DrawOp, PathCommand } from "../ops/types.js";

/**
 * Every annotation that is a shape: replayed, then filled and stroked.
 *
 * The shape itself was decided in `ops/`; what is left is the replay and one
 * engine question — whether this context has `roundRect`. A context without it
 * draws the corners square rather than not drawing the rectangle at all.
 */
export function drawPath(context: Canvas2D, op: Extract<DrawOp, { op: "path" }>): void {
  tracePath(context, op.commands);
  if (op.fill) {
    context.fillStyle = op.fill;
    context.fill();
  }
  if (op.stroke) {
    context.strokeStyle = op.stroke.color;
    context.lineWidth = op.stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.setLineDash(op.stroke.dash);
    context.stroke();
  }
}

function tracePath(context: Canvas2D, commands: readonly PathCommand[]): void {
  context.beginPath();
  for (const command of commands) {
    switch (command.op) {
      case "move":
        context.moveTo(command.to.x, command.to.y);
        break;
      case "line":
        context.lineTo(command.to.x, command.to.y);
        break;
      case "quad":
        context.quadraticCurveTo(command.control.x, command.control.y, command.to.x, command.to.y);
        break;
      case "rect":
        context.rect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
        break;
      case "round-rect":
        if (typeof context.roundRect === "function") {
          context.roundRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height, command.radius);
        } else {
          context.rect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
        }
        break;
      case "ellipse":
        context.ellipse(command.centre.x, command.centre.y, command.radiusX, command.radiusY, 0, 0, Math.PI * 2);
        break;
      case "circle":
        context.arc(command.centre.x, command.centre.y, command.radius, 0, Math.PI * 2);
        break;
      case "close":
        context.closePath();
        break;
    }
  }
}
