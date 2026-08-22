import { meanScale } from "../../geometry/matrix.js";
import { transformBounds } from "../../geometry/rect.js";
import type { Matrix, Rect, Size } from "../../geometry/types.js";
import { drawnSurface, releaseSurface, type Canvas2D, type CanvasSurface } from "../../image/canvas.js";
import { supportsContextFilter } from "../filter-support.js";
import { shuffleOrder } from "../scramble.js";
import type { DrawOp } from "../ops/index.js";

/**
 * Hiding what is already on the canvas.
 *
 * Unlike every other operation, these depend on what was drawn *before* them:
 * every mode but the solid fill reads the pixels back. That is also why each of
 * them can fail — a tainted canvas cannot be read — and why every failure falls
 * back to the solid fill rather than to a hole. See docs/SECURITY.md for what
 * each mode does and does not promise.
 */
export function obscureRegion(context: Canvas2D, op: Extract<DrawOp, { op: "obscure" }>, transform: Matrix): void {
  const { frame } = op;
  if (frame.width <= 0 || frame.height <= 0) return;

  const fillSolid = (): void => {
    context.fillStyle = op.colour;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);
  };

  if (op.mode === "solid") {
    fillSolid();
    return;
  }

  const canvas = context.canvas;
  const clamped = clampRect(transformBounds(transform, frame), canvas.width, canvas.height);
  // Reachable only for a transform that collapses the region to nothing, since
  // `clampRect` floors the near edge and ceils the far one and so never returns
  // less than a pixel of a region that has any area at all. There is nothing to
  // paint over in that case, and nothing a fill would land on either.
  if (clamped.width < 1 || clamped.height < 1) return;

  try {
    const strength = obscureStrength(op.strength, transform);
    const applied =
      op.mode === "blur"
        ? blurRegion(context, clamped, strength)
        : mosaicRegion(context, clamped, strength, op.mode === "scramble" ? op.seed : null);
    if (applied) return;
  } catch {
    // A tainted canvas cannot be read back; fall through to the solid fill.
  }

  fillSolid();
}

/**
 * A strength in image pixels, in the device pixels it will be applied in.
 *
 * It has to travel through the render transform, and which number is taken off
 * that matrix matters: the first two terms are `s·cos θ` and `s·sin θ`, so the
 * larger of them is `s` only when the picture is square to the canvas. At 45°
 * it is 71% of `s`, which is a redaction quietly weaker than the one asked for
 * — and quietly weaker is the worst kind for something whose whole job is to
 * destroy information.
 */
export function obscureStrength(strength: number, transform: Matrix): number {
  return strength * meanScale(transform);
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  return {
    x,
    y,
    width: Math.min(Math.ceil(rect.x + rect.width), width) - x,
    height: Math.min(Math.ceil(rect.y + rect.height), height) - y,
  };
}

/**
 * Copies a device-space region of the canvas into a surface of its own.
 *
 * Every mode here works the same way — take what is already drawn, change it,
 * put it back — and the taking and the putting back are the same two calls each
 * time. Getting either wrong, a stale transform or smoothing left on, is
 * invisible until someone looks closely at a picture that was meant to hide
 * something.
 */
function copyRegion(context: Canvas2D, region: Rect, target: Size, filter?: string): CanvasSurface {
  return drawnSurface(target, (surface) => {
    if (filter) surface.context.filter = filter;
    surface.context.imageSmoothingEnabled = true;
    surface.context.drawImage(
      context.canvas as CanvasImageSource,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      target.width,
      target.height,
    );
  });
}

/** Draws part of a surface back over a device-space region, at identity. */
function drawBack(context: Canvas2D, surface: CanvasSurface, from: Rect, region: Rect, smooth: boolean): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = smooth;
  context.drawImage(
    surface.canvas as CanvasImageSource,
    from.x,
    from.y,
    from.width,
    from.height,
    region.x,
    region.y,
    region.width,
    region.height,
  );
  // Both the transform and the smoothing flag are part of the drawing state, so
  // one `restore` puts both back and neither is reset by hand.
  context.restore();
}

/** Blurs by sampling a margin around the region, so its edges do not darken. */
function blurRegion(context: Canvas2D, region: Rect, radius: number): boolean {
  if (!supportsContextFilter(context)) return false;
  const margin = Math.ceil(radius * 2);
  const source = clampRect(
    { x: region.x - margin, y: region.y - margin, width: region.width + margin * 2, height: region.height + margin * 2 },
    context.canvas.width,
    context.canvas.height,
  );

  const surface = copyRegion(context, source, source, `blur(${radius}px)`);
  try {
    const within = { x: region.x - source.x, y: region.y - source.y, width: region.width, height: region.height };
    drawBack(context, surface, within, region, true);
    return true;
  } finally {
    releaseSurface(surface);
  }
}

/**
 * Averages each block down and draws it back — the whole of `pixelate`, and the
 * first half of `scramble`.
 *
 * With a seed the mosaic is also shuffled before it goes back, and it goes back
 * smoothed rather than hard-edged. Averaging destroys what was inside a block;
 * shuffling destroys where each block was, which is what a brute force over a
 * known font and layout otherwise still has to work with.
 */
function mosaicRegion(context: Canvas2D, region: Rect, blockSize: number, seed: number | null): boolean {
  const grid = blockGrid(region, blockSize);
  const surface = copyRegion(context, region, grid);
  try {
    if (seed !== null) shuffleSurface(surface, seed);
    drawBack(context, surface, { x: 0, y: 0, ...grid }, region, seed !== null);
    return true;
  } finally {
    releaseSurface(surface);
  }
}

/**
 * Permutes the pixels of the mosaic, which are its blocks.
 *
 * Done at mosaic resolution on purpose: a few hundred pixels is one read and
 * one write, where permuting the blocks at full size would be one `drawImage`
 * per block on every frame of a drag.
 */
function shuffleSurface(surface: CanvasSurface, seed: number): void {
  const { width, height } = surface.canvas;
  const image = surface.context.getImageData(0, 0, width, height);
  const order = shuffleOrder(width * height, seed);

  // A copy, because the read and the write would otherwise overlap and each
  // pixel moved would overwrite one not yet moved.
  const source = new Uint32Array(image.data.buffer.slice(0));
  const target = new Uint32Array(image.data.buffer);
  for (let index = 0; index < order.length; index += 1) target[index] = source[order[index]!]!;

  surface.context.putImageData(image, 0, 0);
}

/** How many blocks a region breaks into at this block size; at least one. */
function blockGrid(region: Rect, blockSize: number): Size {
  const size = Math.max(1, blockSize);
  return {
    width: Math.max(1, Math.round(region.width / size)),
    height: Math.max(1, Math.round(region.height / size)),
  };
}
