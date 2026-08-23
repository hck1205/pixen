export * from "./view.js";
// Named rather than starred: `@pixen/web` re-exports this barrel wholesale, so
// anything added here is public API. The overlay's plan and geometry are the
// part a host can use; the drawing is the viewport's own business.
export {
  CORNER_ARM,
  cornerSegments,
  gridSegments,
  planOverlay,
  projectRect,
  type OverlayPlan,
  type Segment,
} from "./overlay/index.js";
export * from "./gestures/index.js";
export { Viewport, type ViewportCallbacks } from "./viewport.js";
export * from "./text-box.js";
