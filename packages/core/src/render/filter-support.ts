/**
 * Whether a canvas context can filter for itself.
 *
 * One question, asked by two callers that want opposite things from the answer:
 * the executor picks between `ctx.filter` and a per-pixel pass, and the redactor
 * decides whether it can blur at all. It lived beside the pixel maths, which is
 * what the *other* branch does — two subjects in one module, and the symptom was
 * a doc comment for the pixel pass stranded seventeen lines above the function
 * it described, because there was no one sentence the file could carry.
 */
import type { Canvas2D } from "../image/canvas.js";

/**
 * Canvas2D `filter` is unavailable on older Safari, so it is feature-detected —
 * per context, cached in a WeakMap rather than a module-level flag, so a test or
 * a second canvas can never inherit another one's answer.
 */
const filterSupport = new WeakMap<object, boolean>();

export function supportsContextFilter(context: Canvas2D): boolean {
  const cached = filterSupport.get(context);
  if (cached !== undefined) return cached;

  let supported = false;
  try {
    const previous = context.filter;
    context.filter = "brightness(1.5)";
    supported = context.filter !== "none" && context.filter !== "";
    context.filter = previous ?? "none";
  } catch {
    supported = false;
  }
  filterSupport.set(context, supported);
  return supported;
}
