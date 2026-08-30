import {
  applyToPoint,
  compose,
  contextMeasurer,
  createId,
  Editor,
  imageToStage,
  longestEdge,
  renderScene,
  scaling,
  stageToView,
  type Matrix,
  type Point,
  type Size,
  type TextMeasurer,
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
import { drawOverlay, planOverlay, readOverlayPalette } from "./overlay/index.js";
import { PINCH_POINTERS, TouchPoints } from "./touch.js";
import { DEFAULT_STYLE, type AnnotationStyle, type ToolId } from "../tools/index.js";
import {
  fitView,
  type ViewFit,
  insetsFor,
  insetsFromChrome,
  renderScale,
  viewportScene,
  zoomAt,
  type EdgeBox,
} from "./view.js";

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
   *
   * The viewport has already opened the transaction the edit belongs to, so a
   * host that cannot open an editor must say so by returning `false` — nothing
   * else would ever close it. Returning nothing means it opened, which is what
   * a host that simply shows its own editor does.
   */
  onEditText?: (layerId: string) => void | boolean;
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
  /**
   * The same measurer the renderer uses, over the same context, so the box a
   * caption is selected by is the box its letters are drawn in. Reading the
   * font is not destructive — every text operation sets its own before drawing.
   */
  #measure: TextMeasurer;
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
    this.#measure = contextMeasurer(context);
    this.#editor = editor;
    // The engine estimates captions until something with a canvas tells it
    // better; this is that something, and it is the renderer's own measurer.
    editor.measureText = this.#measure;
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
    this.#moveView(fitView(this.#editor.stageSize, size, insets), true);
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
    // The arithmetic is `zoomAt`; this is what it takes effect on.
    const view = zoomAt(this.#editor.stageSize, this.#cssSize(), { zoom: this.#zoom, pan: this.#pan }, factor, anchor);
    if (view.zoom === this.#zoom) return;

    this.#moveView(view, false);
  }

  panBy(delta: Point): void {
    this.#moveView({ zoom: this.#zoom, pan: { x: this.#pan.x + delta.x, y: this.#pan.y + delta.y } }, false);
  }

  /**
   * Everything a change of view does, in the one place that does it.
   *
   * Written out three times before, and the third — `panBy` — left the host
   * unannounced, while `onViewChange` says on the line above it that it fires
   * for zoom *and* pan. Nothing in Pixen's own chrome noticed, because a pan
   * moves no readout; what it cost is a host that draws its own overlay through
   * the exported `Viewport`, which missed every pan and saw a pinch as a zoom
   * carrying the pan of the step before it.
   */
  #moveView(view: ViewFit, autoFit: boolean): void {
    this.#zoom = view.zoom;
    this.#pan = view.pan;
    this.#autoFit = autoFit;
    this.invalidate();
    this.#callbacks.onViewChange?.();
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
      layers: document.layers,
      selectedId: this.#editor.selectedLayer?.id ?? null,
      viewMatrix: this.#viewMatrix(),
      stageFromImage: this.#stageFromImage(),
      imageLongestEdge: longestEdge(document.source),
      measure: this.#measure,
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

  /** `MouseEvent`, because pointer, wheel and double-click all are one. */
  #eventPoint(event: MouseEvent): Point {
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
    const dpr = renderScale(window.devicePixelRatio);
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

    const deviceMatrix = compose(scaling(dpr), this.#viewMatrix());
    renderScene(context, viewportScene(this.#editor, { width, height }, deviceMatrix), { clear: false });

    context.setTransform(1, 0, 0, 1, 0, 0);
    this.#drawOverlay(context, deviceMatrix, dpr);
  }

  #drawOverlay(context: CanvasRenderingContext2D, matrix: Matrix, dpr: number): void {
    drawOverlay(context, {
      plan: planOverlay(this.#tool, this.#editor.selectedLayer),
      selected: this.#editor.selectedLayer,
      crop: this.#editor.cropRect,
      stage: this.#editor.stageRect,
      stageFromImage: this.#stageFromImage(),
      stageToScreen: (point) => this.stageToScreen(point),
      measure: this.#measure,
      palette: readOverlayPalette(getComputedStyle(this.canvas)),
      matrix,
      dpr,
    });
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
      case "select-tool":
        this.tool = effect.tool;
        break;
      case "focus-text":
        this.#handOverTextEdit(effect.layerId);
        break;
    }
  }

  /**
   * Hands an open transaction to whoever edits the text, or takes it back.
   *
   * Both openers — the text tool and the double-click — begin the transaction
   * before asking for an editor, so that creating a layer and typing into it
   * are one undo step. That leaves the transaction stranded if no editor
   * appears: `onEditText` is optional, and the editor that Pixen ships declines
   * when there is no view matrix yet. A stranded transaction is not a small
   * thing — the next gesture cannot begin one, and rolling *its* one back tears
   * up the edit that opened this one.
   */
  #handOverTextEdit(layerId: string): void {
    const opened = this.#callbacks.onEditText?.(layerId);
    if (opened === false || this.#callbacks.onEditText === undefined) this.#editor.rollbackTransaction();
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
    const hit = hitLayer(context, toImage(context, this.#eventPoint(event)));
    if (hit?.type !== "text") return;
    event.preventDefault();
    this.#editor.select(hit.id);
    // Opened here for the same reason the text tool opens it: the editor closes
    // whatever was opened for it, and transactions do not nest.
    this.#editor.beginTransaction(TEXT_EDIT_LABEL);
    this.#handOverTextEdit(hit.id);
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
    this.canvas.removeEventListener("dblclick", this.#onDoubleClick);
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }
}




