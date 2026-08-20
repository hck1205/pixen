import {
  applyToPoint,
  compose,
  createId,
  createScene,
  Editor,
  imageToStage,
  layerHandlePosition,
  renderScene,
  scaling,
  stageToView,
  type LayerHandle,
  type Matrix,
  type Point,
  type Rect,
  type Size,
} from "@pixen/core";
import {
  beginGesture,
  cancelGesture,
  cursorFor,
  endGesture,
  hitLayer,
  IDLE,
  moveGesture,
  screenToImage as toImage,
  screenToStage as toStage,
  wheelZoomFactor,
  type GestureContext,
  type GestureEffect,
  type GestureOutcome,
  type GestureState,
} from "./gestures/index.js";
// Straight from the module rather than the barrel: these are the gesture's own
// tuning, and the barrel deliberately keeps tuning out of the package's API.
import { ABSOLUTE_MIN_CROP_SIZE, DEFAULT_MIN_CROP_SIZE } from "./gestures/constants.js";
import { planOverlay, projectRect } from "./overlay.js";
import { PINCH_POINTERS, TouchPoints } from "./touch.js";
import {
  drawCropFrame,
  drawCropScrim,
  drawLayerSelection,
  readOverlayPalette,
  SELECTION_CORNERS,
} from "./chrome.js";
import { DEFAULT_STYLE, type AnnotationStyle, type ToolId } from "../tools/index.js";
import { clampZoom, fitView, insetsFor, insetsFromChrome, MAX_ZOOM, MIN_ZOOM, type EdgeBox } from "./view.js";

/** One label for the whole of "someone edited a text layer". */
const TEXT_EDIT_LABEL = "Text";

export interface ViewportCallbacks {
  /** Fired when the chrome has to be rebuilt: tool, selection, gesture end. */
  onChange?: () => void;
  /** Fired for zoom and pan, which only move a readout — no rebuild needed. */
  onViewChange?: () => void;
  /**
   * Fired when a text layer should be edited: after one is created, and when an
   * existing one is double-clicked.
   */
  onEditText?: (layerId: string) => void;
  /**
   * The chrome as it currently measures, for fitting.
   *
   * Supplied by whoever owns the chrome, because the viewport owns only the
   * canvas — and because a panel that has wrapped onto three rows is a fact
   * about the DOM, not something a constant can know.
   */
  measureChrome?: () => { host: EdgeBox; chrome: EdgeBox[] } | null;
}

/**
 * The canvas shell: what the user sees, and the plumbing that turns DOM events
 * into gestures.
 *
 * Every decision about what a pointer means lives in `gestures.ts`; this class
 * owns the canvas, the render loop, and the view transform. View state (zoom and
 * pan) stays here rather than in the document on purpose — it is per-viewer, not
 * per-image, and putting it in the document would make every wheel tick a change
 * to a saved value.
 */
export class Viewport {
  readonly canvas: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #editor: Editor;
  #callbacks: ViewportCallbacks;

  #zoom = 1;
  #pan: Point = { x: 0, y: 0 };
  #autoFit = true;
  #tool: ToolId = "crop";
  #style: AnnotationStyle = { ...DEFAULT_STYLE };
  #minCropSize = DEFAULT_MIN_CROP_SIZE;

  #gesture: GestureState = IDLE;
  readonly #touch = new TouchPoints();
  #frame = 0;
  #observer: ResizeObserver | null = null;
  #unsubscribe: Array<() => void> = [];
  #destroyed = false;

  constructor(canvas: HTMLCanvasElement, editor: Editor, callbacks: ViewportCallbacks = {}) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Pixen: could not acquire a 2D context for the viewport");
    this.canvas = canvas;
    this.#context = context;
    this.#editor = editor;
    this.#callbacks = callbacks;

    this.#unsubscribe.push(editor.on("change", () => this.invalidate()));
    this.#unsubscribe.push(editor.on("load", () => this.fit()));

    if (typeof ResizeObserver !== "undefined") {
      this.#observer = new ResizeObserver(() => {
        if (this.#autoFit) this.fit();
        else this.invalidate();
      });
      this.#observer.observe(canvas);
    }

    canvas.addEventListener("pointerdown", this.#onPointerDown);
    canvas.addEventListener("pointermove", this.#onPointerMove);
    canvas.addEventListener("pointerup", this.#onPointerUp);
    canvas.addEventListener("pointercancel", this.#onPointerCancel);
    canvas.addEventListener("wheel", this.#onWheel, { passive: false });
    canvas.addEventListener("dblclick", this.#onDoubleClick);
  }

  // --- view state ----------------------------------------------------------

  get zoom(): number {
    return this.#zoom;
  }

  get tool(): ToolId {
    return this.#tool;
  }

  set tool(tool: ToolId) {
    if (this.#tool === tool) return;
    this.#tool = tool;
    this.invalidate();
    this.#callbacks.onChange?.();
  }

  get style(): AnnotationStyle {
    return this.#style;
  }

  set style(style: AnnotationStyle) {
    this.#style = style;
  }

  set minCropSize(value: number) {
    this.#minCropSize = Math.max(ABSOLUTE_MIN_CROP_SIZE, value);
  }

  /** Frames the whole stage inside the area the floating chrome leaves free. */
  fit(): void {
    if (!this.#editor.ready) return;
    const size = this.#cssSize();
    const measured = this.#callbacks.measureChrome?.();
    const insets = measured ? insetsFromChrome(measured.host, measured.chrome) : insetsFor(size);
    const fitted = fitView(this.#editor.stageSize, size, insets);
    this.#zoom = fitted.zoom;
    this.#pan = fitted.pan;
    this.#autoFit = true;
    this.invalidate();
    this.#callbacks.onViewChange?.();
  }

  /**
   * Re-runs the fit, but only while the view is still the one Pixen chose.
   *
   * The chrome's height depends on which panel is open, and a panel that grew
   * would otherwise leave the image fitted to the space the old one left.
   * Someone who has zoomed or panned by hand is left alone.
   */
  refit(): void {
    if (this.#autoFit) this.fit();
  }

  zoomBy(factor: number, anchor?: Point): void {
    const next = clampZoom(this.#zoom * factor);
    if (next === this.#zoom) return;

    if (anchor) {
      // Keep the stage point under the cursor pinned while the scale changes.
      const stagePoint = this.screenToStage(anchor);
      this.#zoom = next;
      this.#autoFit = false;
      const after = this.stageToScreen(stagePoint);
      this.#pan = { x: this.#pan.x + (anchor.x - after.x), y: this.#pan.y + (anchor.y - after.y) };
    } else {
      this.#zoom = next;
      this.#autoFit = false;
    }
    this.invalidate();
    this.#callbacks.onViewChange?.();
  }

  panBy(delta: Point): void {
    this.#pan = { x: this.#pan.x + delta.x, y: this.#pan.y + delta.y };
    this.#autoFit = false;
    this.invalidate();
  }

  // --- coordinates ---------------------------------------------------------

  #cssSize(): Size {
    const rect = this.canvas.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  /** stage -> CSS pixels inside the canvas. */
  #viewMatrix(): Matrix {
    return stageToView(this.#editor.stageSize, this.#cssSize(), this.#zoom, this.#pan);
  }

  /** The world as the gesture reducer needs to see it. */
  #gestureContext(): GestureContext {
    const document = this.#editor.document;
    return {
      tool: this.#tool,
      crop: this.#editor.cropRect,
      stage: this.#editor.stageRect,
      layers: document.layers,
      selectedId: this.#editor.selectedLayer?.id ?? null,
      viewMatrix: this.#viewMatrix(),
      stageFromImage: this.#stageFromImage(),
      imageLongestEdge: Math.max(document.source.width, document.source.height),
      style: this.#style,
      minCropSize: this.#minCropSize,
      createId,
    };
  }

  /**
   * image -> stage, the document's own transform.
   *
   * This used to build a whole scene and invert the matrix out of it, which
   * every caller then inverted back — two inversions and a full projection of
   * the document, on every pointer move. The scene's own image matrix *is*
   * `imageToStage` for a stage-region render, so the conversion comes from
   * `spaces.ts` like every other one.
   */
  #stageFromImage(): Matrix {
    return imageToStage(this.#editor.document.source, this.#editor.document.transform);
  }

  screenToStage(point: Point): Point {
    return toStage(this.#gestureContext(), point);
  }

  stageToScreen(point: Point): Point {
    return applyToPoint(this.#viewMatrix(), point);
  }

  /** image space -> CSS pixels on the canvas, for chrome placed over a layer. */
  imageToScreen(): Matrix {
    return compose(this.#viewMatrix(), this.#stageFromImage());
  }

  screenToImage(point: Point): Point {
    return toImage(this.#gestureContext(), point);
  }

  #eventPoint(event: PointerEvent | WheelEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // --- rendering -----------------------------------------------------------

  invalidate(): void {
    if (this.#destroyed || this.#frame !== 0) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.render();
    });
  }

  render(): void {
    if (this.#destroyed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const css = this.#cssSize();
    const width = Math.round(css.width * dpr);
    const height = Math.round(css.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const context = this.#context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!this.#editor.ready) return;

    const document = this.#editor.document;
    const preview = this.#editor.resources.getPreview(document.source.resourceId);
    const deviceMatrix = compose(scaling(dpr), this.#viewMatrix());

    renderScene(
      context,
      createScene(
        document,
        { source: preview.source, sourceScale: preview.scale, resolveResource: this.#editor.resources.resolve },
        { region: "stage", target: { width, height }, fit: "none", transform: deviceMatrix },
      ),
      { clear: false },
    );

    context.setTransform(1, 0, 0, 1, 0, 0);
    this.#drawOverlay(context, deviceMatrix, dpr);
  }

  #drawOverlay(context: CanvasRenderingContext2D, matrix: Matrix, dpr: number): void {
    const selected = this.#editor.selectedLayer;
    const plan = planOverlay(this.#tool, selected);
    if (plan.kind === "none") return;
    const palette = readOverlayPalette(getComputedStyle(this.canvas));

    if (plan.kind === "crop") {
      const crop = this.#editor.cropRect;
      drawCropScrim(context, { stage: this.#editor.stageRect, crop, matrix, colour: palette.scrim });
      context.setTransform(1, 0, 0, 1, 0, 0);
      drawCropFrame(context, { rect: this.#toScreenRect(crop, dpr), palette, dpr });
      return;
    }
    if (!selected) return;

    // Handles are image space; everything drawn here is device pixels.
    const stageFromImage = this.#stageFromImage();
    const at = (handle: LayerHandle): Point => {
      const screen = this.stageToScreen(applyToPoint(stageFromImage, layerHandlePosition(selected, handle)));
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

  /** stage rect -> device pixels, through the current view transform. */
  #toScreenRect(rect: Rect, dpr: number): Rect {
    return projectRect(rect, (point) => this.stageToScreen(point), dpr);
  }

  // --- pointer input -------------------------------------------------------

  #apply(outcome: GestureOutcome): void {
    this.#gesture = outcome.state;
    for (const effect of outcome.effects) this.#applyEffect(effect);
  }

  #applyEffect(effect: GestureEffect): void {
    switch (effect.kind) {
      case "intent":
        this.#editor.dispatch(effect.intent);
        break;
      case "view-pan":
        this.panBy(effect.delta);
        break;
      case "view-zoom":
        this.zoomBy(effect.factor, effect.anchor);
        break;
      case "select-tool":
        this.tool = effect.tool;
        break;
      case "focus-text":
        this.#callbacks.onEditText?.(effect.layerId);
        break;
    }
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.#editor.ready) return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.#eventPoint(event);
    this.#touch.down(event.pointerId, point);

    if (this.#touch.count === PINCH_POINTERS) {
      this.#apply(cancelGesture(this.#gesture));
      this.#touch.beginPinch();
      return;
    }
    if (this.#touch.count > PINCH_POINTERS) return;

    event.preventDefault();
    this.#apply(
      beginGesture({ point, shiftKey: event.shiftKey, button: event.button }, this.#gestureContext()),
    );
    this.#callbacks.onChange?.();
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#editor.ready) return;
    const point = this.#eventPoint(event);
    this.#touch.move(event.pointerId, point);

    if (this.#touch.pinching) {
      const step = this.#touch.step();
      if (step) {
        this.zoomBy(step.factor, step.centre);
        this.panBy(step.delta);
      }
      return;
    }
    if (this.#gesture.kind === "idle") {
      this.canvas.style.cursor = cursorFor(this.#gestureContext(), point);
      return;
    }

    event.preventDefault();
    this.#apply(moveGesture(this.#gesture, { point, shiftKey: event.shiftKey }, this.#gestureContext()));
  };

  #onPointerUp = (event: PointerEvent): void => {
    this.#touch.up(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.#gesture.kind === "idle") return;

    this.#apply(endGesture(this.#gesture, this.#gestureContext()));
    this.#callbacks.onChange?.();
  };

  #onPointerCancel = (): void => {
    this.#touch.cancel();
    this.#apply(cancelGesture(this.#gesture));
  };

  /** Double-clicking text edits it, which is where anyone would look first. */
  #onDoubleClick = (event: MouseEvent): void => {
    if (!this.#editor.ready) return;
    const context = this.#gestureContext();
    const hit = hitLayer(context, toImage(context, this.#eventPoint(event as unknown as PointerEvent)));
    if (hit?.type !== "text") return;
    event.preventDefault();
    this.#editor.select(hit.id);
    // Opened here for the same reason the text tool opens it: the editor closes
    // whatever was opened for it, and transactions do not nest.
    this.#editor.beginTransaction(TEXT_EDIT_LABEL);
    this.#callbacks.onEditText?.(hit.id);
  };

  #onWheel = (event: WheelEvent): void => {
    if (!this.#editor.ready) return;
    event.preventDefault();
    this.zoomBy(wheelZoomFactor(event.deltaY, event.ctrlKey), this.#eventPoint(event));
  };

  destroy(): void {
    this.#destroyed = true;
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#observer?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.#onPointerDown);
    this.canvas.removeEventListener("pointermove", this.#onPointerMove);
    this.canvas.removeEventListener("pointerup", this.#onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.#onPointerCancel);
    this.canvas.removeEventListener("wheel", this.#onWheel);
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }
}




