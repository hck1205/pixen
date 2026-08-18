import {
  compose,
  createId,
  createScene,
  Editor,
  invert,
  layerBounds,
  renderScene,
  scaling,
  stageToView,
  toArray,
  zoomToFit,
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
  IDLE,
  moveGesture,
  pinchFrom,
  pinchStep,
  screenToImage as toImage,
  screenToStage as toStage,
  wheelZoomFactor,
  type GestureContext,
  type GestureEffect,
  type GestureOutcome,
  type GestureState,
  type PinchState,
} from "./gestures.js";
import { cornerSegments, gridSegments, inflate, projectRect, type Segment } from "./overlay.js";
import { DEFAULT_STYLE, type AnnotationStyle, type ToolId } from "./tools.js";

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 12;
const VIEW_PADDING = 28;

export interface ViewportCallbacks {
  /** Fired whenever the UI should refresh (zoom, tool, selection, document). */
  onChange?: () => void;
  /** Fired after a text layer is created, so the host can focus its editor. */
  onTextCreated?: (layerId: string) => void;
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
  #minCropSize = 24;

  #gesture: GestureState = IDLE;
  #pointers = new Map<number, Point>();
  #pinch: PinchState | null = null;
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
    this.#minCropSize = Math.max(4, value);
  }

  /** Frames the whole stage in the viewport. */
  fit(): void {
    if (!this.#editor.ready) return;
    this.#zoom = clamp(zoomToFit(this.#editor.stageSize, this.#cssSize(), VIEW_PADDING), MIN_ZOOM, MAX_ZOOM);
    this.#pan = { x: 0, y: 0 };
    this.#autoFit = true;
    this.invalidate();
    this.#callbacks.onChange?.();
  }

  zoomBy(factor: number, anchor?: Point): void {
    const next = clamp(this.#zoom * factor, MIN_ZOOM, MAX_ZOOM);
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
    this.#callbacks.onChange?.();
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
      viewMatrix: this.#viewMatrix(),
      stageFromImage: invert(this.#imageFromStage()),
      imageLongestEdge: Math.max(document.source.width, document.source.height),
      style: this.#style,
      minCropSize: this.#minCropSize,
      createId,
    };
  }

  /** stage -> image, the inverse of the document's own transform. */
  #imageFromStage(): Matrix {
    const scene = createScene(
      this.#editor.document,
      { source: this.#editor.resource.source },
      { region: "stage", fit: "none" },
    );
    return invert(scene.image.matrix);
  }

  screenToStage(point: Point): Point {
    return toStage(this.#gestureContext(), point);
  }

  stageToScreen(point: Point): Point {
    return { ...applyView(this.#viewMatrix(), point) };
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
        { source: preview.source, sourceScale: preview.scale },
        { region: "stage", target: { width, height }, fit: "none", transform: deviceMatrix },
      ),
      { clear: false },
    );

    context.setTransform(1, 0, 0, 1, 0, 0);
    this.#drawOverlay(context, deviceMatrix, dpr);
  }

  #drawOverlay(context: CanvasRenderingContext2D, matrix: Matrix, dpr: number): void {
    const styles = getComputedStyle(this.canvas);
    const crop = this.#editor.cropRect;
    const stage = this.#editor.stageRect;

    if (this.#tool === "crop") {
      // Scrim everything outside the crop with the even-odd rule, which avoids
      // four separate rects meeting on seams.
      context.save();
      context.setTransform(...toArray(matrix));
      context.beginPath();
      context.rect(stage.x - 1e4, stage.y - 1e4, stage.width + 2e4, stage.height + 2e4);
      context.rect(crop.x, crop.y, crop.width, crop.height);
      context.fillStyle = cssVar(styles, "--pixen-crop-scrim", "rgba(8,9,12,0.62)");
      context.fill("evenodd");
      context.restore();

      context.setTransform(1, 0, 0, 1, 0, 0);
      const screenCrop = projectRect(crop, (point) => this.stageToScreen(point), dpr);
      strokeSegments(context, gridSegments(screenCrop), cssVar(styles, "--pixen-grid-line", "rgba(255,255,255,0.28)"), dpr);

      context.strokeStyle = cssVar(styles, "--pixen-crop-outline", "rgba(255,255,255,0.95)");
      context.lineWidth = 1.5 * dpr;
      context.strokeRect(screenCrop.x, screenCrop.y, screenCrop.width, screenCrop.height);

      context.lineCap = "square";
      strokeSegments(
        context,
        cornerSegments(screenCrop, 22 * dpr),
        cssVar(styles, "--pixen-crop-outline", "rgba(255,255,255,0.95)"),
        dpr * 3.5,
      );
      return;
    }

    const selected = this.#editor.selectedLayer;
    if (!selected) return;

    const bounds = layerBounds(selected);
    const stageFromImage = invert(this.#imageFromStage());
    const projected = projectRect(
      transformRect(bounds, stageFromImage),
      (point) => this.stageToScreen(point),
      dpr,
    );

    context.save();
    context.strokeStyle = cssVar(styles, "--pixen-selection", "#4f8cff");
    context.lineWidth = 1.5 * dpr;
    context.setLineDash([5 * dpr, 4 * dpr]);
    const outline = inflate(projected, 6 * dpr);
    context.strokeRect(outline.x, outline.y, outline.width, outline.height);
    context.restore();
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
        this.#callbacks.onTextCreated?.(effect.layerId);
        break;
    }
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.#editor.ready) return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.#eventPoint(event);
    this.#pointers.set(event.pointerId, point);

    if (this.#pointers.size === 2) {
      this.#apply(cancelGesture(this.#gesture));
      this.#startPinch();
      return;
    }
    if (this.#pointers.size > 2) return;

    event.preventDefault();
    this.#apply(
      beginGesture({ point, shiftKey: event.shiftKey, button: event.button }, this.#gestureContext()),
    );
    this.#callbacks.onChange?.();
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#editor.ready) return;
    const point = this.#eventPoint(event);
    if (this.#pointers.has(event.pointerId)) this.#pointers.set(event.pointerId, point);

    if (this.#pinch) {
      this.#updatePinch();
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
    this.#pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.#pointers.size < 2) this.#pinch = null;
    if (this.#gesture.kind === "idle") return;

    this.#apply(endGesture(this.#gesture, this.#gestureContext()));
    this.#callbacks.onChange?.();
  };

  #onPointerCancel = (event: PointerEvent): void => {
    this.#pointers.delete(event.pointerId);
    this.#pinch = null;
    this.#apply(cancelGesture(this.#gesture));
  };

  #startPinch(): void {
    const [a, b] = [...this.#pointers.values()];
    if (a && b) this.#pinch = pinchFrom(a, b);
  }

  #updatePinch(): void {
    const previous = this.#pinch;
    if (!previous) return;
    const [a, b] = [...this.#pointers.values()];
    if (!a || !b) return;

    const current = pinchFrom(a, b);
    const { factor, delta } = pinchStep(previous, current);
    this.zoomBy(factor, current.centre);
    this.panBy(delta);
    this.#pinch = current;
  }

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyView(matrix: Matrix, point: Point): Point {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
}

function transformRect(rect: Rect, matrix: Matrix): Rect {
  const topLeft = applyView(matrix, { x: rect.x, y: rect.y });
  const bottomRight = applyView(matrix, { x: rect.x + rect.width, y: rect.y + rect.height });
  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  };
}

function cssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

function strokeSegments(
  context: CanvasRenderingContext2D,
  segments: readonly Segment[],
  colour: string,
  lineWidth: number,
): void {
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = lineWidth;
  context.beginPath();
  for (const segment of segments) {
    context.moveTo(segment.from.x, segment.from.y);
    context.lineTo(segment.to.x, segment.to.y);
  }
  context.stroke();
  context.restore();
}
