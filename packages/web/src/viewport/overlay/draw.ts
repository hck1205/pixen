import {
  applyToPoint,
  layerHandlePosition,
  type EditorLayer,
  type LayerHandle,
  type Matrix,
  type Point,
  type Rect,
  type TextMeasurer,
} from "@pixen/core";
import { drawCropFrame, drawCropScrim } from "./crop.js";
import { projectRect } from "./geometry.js";
import type { OverlayPalette } from "./palette.js";
import type { OverlayPlan } from "./plan.js";
import { drawLayerSelection, SELECTION_CORNERS } from "./selection.js";

/**
 * One frame of the overlay: what the plan calls for, drawn.
 *
 * The whole of the decision is in `plan.ts` and the whole of the geometry in
 * `geometry.ts`, so what is left here is reading a scene and dispatching to
 * one of the two things the overlay can be.
 */
/** Everything the overlay is drawn from, read once by the viewport per frame. */
export interface OverlayScene {
  plan: OverlayPlan;
  selected: EditorLayer | null;
  /** Both in stage space. */
  crop: Rect;
  stage: Rect;
  stageFromImage: Matrix;
  /** Stage space to CSS pixels. */
  stageToScreen: (point: Point) => Point;
  palette: OverlayPalette;
  /** Image space to device pixels, for the scrim. */
  matrix: Matrix;
  /** How a caption is measured, so its handles sit on its letters. */
  measure: TextMeasurer;
  dpr: number;
}

/**
 * The overlay the plan calls for.
 *
 * The viewport reads the state and this draws it, which keeps the two apart:
 * `planOverlay` decides *whether* there are handles and which ones, this turns
 * that into strokes, and neither needs to know the other's reasons.
 */
export function drawOverlay(context: CanvasRenderingContext2D, scene: OverlayScene): void {
  const { plan, palette, dpr } = scene;
  if (plan.kind === "none") return;

  if (plan.kind === "crop") {
    drawCropScrim(context, { stage: scene.stage, crop: scene.crop, matrix: scene.matrix, colour: palette.scrim });
    context.setTransform(1, 0, 0, 1, 0, 0);
    drawCropFrame(context, { rect: projectRect(scene.crop, scene.stageToScreen, dpr), palette, dpr });
    return;
  }

  const selected = scene.selected;
  if (!selected) return;

  // Handles are image space; everything drawn here is device pixels.
  const at = (handle: LayerHandle): Point => {
    const screen = scene.stageToScreen(applyToPoint(scene.stageFromImage, layerHandlePosition(selected, handle, scene.measure)));
    return { x: screen.x * dpr, y: screen.y * dpr };
  };

  drawLayerSelection(context, {
    quad: SELECTION_CORNERS.map(at),
    handles: plan.grips.map(at),
    rotate: plan.rotate ? at("rotate") : null,
    colour: palette.selection,
    dpr,
  });
}
