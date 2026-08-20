import { longestEdge } from "../../geometry/rect.js";
import type { Canvas2D } from "../../image/canvas.js";
import type { DrawOp } from "../ops/index.js";

/**
 * The two things drawn over the finished picture: a vignette and a frame.
 *
 * Both are effects of position rather than of content, which is precisely why
 * neither is a CSS filter — no filter function shades by where a pixel is.
 */
/**
 * How far in from the corner the darkening starts, and how dark it gets at the
 * very edge at full strength.
 */
const VIGNETTE_INNER_STOP = 0.45;
const VIGNETTE_MAX_ALPHA = 0.85;

/**
 * A radial fall-off towards the corners.
 *
 * Drawn rather than filtered: CSS filters have nothing that shades by position,
 * and a gradient fill costs one paint instead of a pass over every pixel.
 */
export function drawVignette(context: Canvas2D, op: Extract<DrawOp, { op: "vignette" }>): void {
  const { rect, strength } = op;
  if (strength <= 0 || rect.width <= 0 || rect.height <= 0) return;

  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  // The gradient is circular, so it is drawn on a squared-up canvas and scaled
  // back to the rect — otherwise a wide image gets an oval.
  const radius = longestEdge(rect) / 2;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.translate(centreX, centreY);
  context.scale(rect.width / (radius * 2), rect.height / (radius * 2));

  const gradient = context.createRadialGradient(0, 0, radius * VIGNETTE_INNER_STOP, 0, 0, radius * Math.SQRT2);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, `rgba(0, 0, 0, ${(strength * VIGNETTE_MAX_ALPHA).toFixed(3)})`);
  context.fillStyle = gradient;
  context.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
  context.restore();
}

/**
 * The three frame styles.
 *
 * `solid` and `rounded` sit on the very edge, so half the stroke would fall
 * outside the canvas — they are inset by half a line width to stay whole.
 * `inset` is a hairline standing off the edge, which is a different look rather
 * than a different thickness.
 */
export function drawFrame(context: Canvas2D, op: Extract<DrawOp, { op: "frame" }>): void {
  const { rect, width, colour, style } = op;
  if (width <= 0 || rect.width <= 0 || rect.height <= 0) return;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.strokeStyle = colour;
  context.lineWidth = width;

  const offset = style === "inset" ? op.inset + width / 2 : width / 2;
  const box = {
    x: rect.x + offset,
    y: rect.y + offset,
    width: Math.max(0, rect.width - offset * 2),
    height: Math.max(0, rect.height - offset * 2),
  };

  if (box.width <= 0 || box.height <= 0) {
    context.restore();
    return;
  }

  context.beginPath();
  if (style === "rounded" && typeof context.roundRect === "function") {
    // The radius cannot exceed half the shorter side, or the corners overlap.
    const radius = Math.min(op.radius, box.width / 2, box.height / 2);
    context.roundRect(box.x, box.y, box.width, box.height, radius);
  } else {
    context.rect(box.x, box.y, box.width, box.height);
  }
  context.stroke();
  context.restore();
}
