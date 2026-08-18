import {
  applyToPoint,
  compose,
  createArrowLayer,
  createEllipseLayer,
  createPathLayer,
  createRectLayer,
  createScene,
  createTextLayer,
  CROP_HANDLES,
  Editor,
  invert,
  layerBounds,
  renderScene,
  scaling,
  stageToImage,
  stageToView,
  toArray,
  zoomToFit,
  type CropHandle,
  type EditorLayer,
  type Matrix,
  type Point,
  type Rect,
  type Size,
} from "@pixen/core";
import { DEFAULT_STYLE, fontSizeFor, strokeFor, type AnnotationStyle, type ToolId } from "./tools.js";

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 12;
const HANDLE_HIT_RADIUS = 14;
const VIEW_PADDING = 28;

type Gesture =
  | { kind: "none" }
  | { kind: "view-pan"; last: Point }
  | { kind: "crop-move"; last: Point }
  | { kind: "crop-resize"; handle: CropHandle }
  | { kind: "layer-move"; id: string; last: Point }
  | { kind: "draw-shape"; id: string; origin: Point; tool: ToolId }
  | { kind: "draw-path"; id: string; points: Point[] };

export interface ViewportCallbacks {
  /** Fired whenever the UI should refresh (zoom, tool, selection, document). */
  onChange?: () => void;
  /** Fired after a text layer is created, so the host can focus its editor. */
  onTextCreated?: (layerId: string) => void;
}

/**
 * Owns the canvas: what the user sees, and what their pointer means.
 *
 * View state (zoom and pan) lives here rather than in the document on purpose —
 * it is per-viewer, not per-image, and putting it in the document would make
 * every scroll wheel tick a change to a saved value.
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

  #gesture: Gesture = { kind: "none" };
  #pointers = new Map<number, Point>();
  #pinch: { distance: number; centre: Point; zoom: number } | null = null;
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
    const viewport = this.#cssSize();
    this.#zoom = clamp(zoomToFit(this.#editor.stageSize, viewport, VIEW_PADDING), MIN_ZOOM, MAX_ZOOM);
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

  // --- coordinate conversion ----------------------------------------------

  #cssSize(): Size {
    const rect = this.canvas.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  /** stage -> CSS pixels inside the canvas. */
  #viewMatrix(): Matrix {
    return stageToView(this.#editor.stageSize, this.#cssSize(), this.#zoom, this.#pan);
  }

  screenToStage(point: Point): Point {
    return applyToPoint(invert(this.#viewMatrix()), point);
  }

  stageToScreen(point: Point): Point {
    return applyToPoint(this.#viewMatrix(), point);
  }

  screenToImage(point: Point): Point {
    const stage = this.screenToStage(point);
    return applyToPoint(stageToImage(this.#editor.document.source, this.#editor.document.transform), stage);
  }

  /** Pointer position in CSS pixels relative to the canvas. */
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

    const scene = createScene(
      document,
      { source: preview.source, sourceScale: preview.scale },
      { region: "stage", target: { width, height }, fit: "none", transform: deviceMatrix },
    );
    renderScene(context, scene, { clear: false });

    context.setTransform(1, 0, 0, 1, 0, 0);
    this.#drawOverlay(context, deviceMatrix, dpr);
  }

  #drawOverlay(context: CanvasRenderingContext2D, matrix: Matrix, dpr: number): void {
    const styles = getComputedStyle(this.canvas);
    const crop = this.#editor.cropRect;
    const stage = this.#editor.stageRect;

    context.save();
    context.setTransform(...toArray(matrix));

    if (this.#tool === "crop") {
      // Scrim everything outside the crop by filling the stage with the
      // even-odd rule, which avoids four separate rects meeting on seams.
      context.beginPath();
      context.rect(stage.x - 1e4, stage.y - 1e4, stage.width + 2e4, stage.height + 2e4);
      context.rect(crop.x, crop.y, crop.width, crop.height);
      context.fillStyle = styles.getPropertyValue("--pixen-crop-scrim").trim() || "rgba(8,9,12,0.62)";
      context.fill("evenodd");
    }

    context.restore();
    context.setTransform(1, 0, 0, 1, 0, 0);

    const cropScreen = this.#rectToScreen(crop, dpr);
    if (this.#tool === "crop") {
      this.#drawCropChrome(context, cropScreen, styles, dpr);
    }

    const selected = this.#editor.selectedLayer;
    if (selected && this.#tool !== "crop") {
      this.#drawSelection(context, selected, dpr, styles);
    }
  }

  #rectToScreen(rect: Rect, dpr: number): Rect {
    const topLeft = this.stageToScreen({ x: rect.x, y: rect.y });
    const bottomRight = this.stageToScreen({ x: rect.x + rect.width, y: rect.y + rect.height });
    return {
      x: topLeft.x * dpr,
      y: topLeft.y * dpr,
      width: (bottomRight.x - topLeft.x) * dpr,
      height: (bottomRight.y - topLeft.y) * dpr,
    };
  }

  #drawCropChrome(
    context: CanvasRenderingContext2D,
    rect: Rect,
    styles: CSSStyleDeclaration,
    dpr: number,
  ): void {
    const outline = styles.getPropertyValue("--pixen-crop-outline").trim() || "rgba(255,255,255,0.95)";
    const grid = styles.getPropertyValue("--pixen-grid-line").trim() || "rgba(255,255,255,0.28)";

    context.save();
    context.strokeStyle = grid;
    context.lineWidth = 1 * dpr;
    context.beginPath();
    for (let i = 1; i < 3; i += 1) {
      const x = rect.x + (rect.width * i) / 3;
      const y = rect.y + (rect.height * i) / 3;
      context.moveTo(x, rect.y);
      context.lineTo(x, rect.y + rect.height);
      context.moveTo(rect.x, y);
      context.lineTo(rect.x + rect.width, y);
    }
    context.stroke();

    context.strokeStyle = outline;
    context.lineWidth = 1.5 * dpr;
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);

    // Corner brackets read as grab targets without the visual weight of dots.
    const arm = Math.min(22 * dpr, rect.width / 3, rect.height / 3);
    context.lineWidth = 3.5 * dpr;
    context.lineCap = "square";
    context.beginPath();
    const corners: Array<[number, number, number, number]> = [
      [rect.x, rect.y, 1, 1],
      [rect.x + rect.width, rect.y, -1, 1],
      [rect.x + rect.width, rect.y + rect.height, -1, -1],
      [rect.x, rect.y + rect.height, 1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      context.moveTo(x + arm * dx, y);
      context.lineTo(x, y);
      context.lineTo(x, y + arm * dy);
    }
    context.stroke();
    context.restore();
  }

  #drawSelection(
    context: CanvasRenderingContext2D,
    layer: EditorLayer,
    dpr: number,
    styles: CSSStyleDeclaration,
  ): void {
    const bounds = layerBounds(layer);
    const imageToStageMatrix = invert(stageToImage(this.#editor.document.source, this.#editor.document.transform));
    const topLeft = applyToPoint(imageToStageMatrix, { x: bounds.x, y: bounds.y });
    const bottomRight = applyToPoint(imageToStageMatrix, {
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });
    const a = this.stageToScreen(topLeft);
    const b = this.stageToScreen(bottomRight);
    const padding = 6 * dpr;

    context.save();
    context.strokeStyle = styles.getPropertyValue("--pixen-selection").trim() || "#4f8cff";
    context.lineWidth = 1.5 * dpr;
    context.setLineDash([5 * dpr, 4 * dpr]);
    context.strokeRect(
      Math.min(a.x, b.x) * dpr - padding,
      Math.min(a.y, b.y) * dpr - padding,
      Math.abs(b.x - a.x) * dpr + padding * 2,
      Math.abs(b.y - a.y) * dpr + padding * 2,
    );
    context.restore();
  }

  // --- pointer input -------------------------------------------------------

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.#editor.ready) return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.#eventPoint(event);
    this.#pointers.set(event.pointerId, point);

    if (this.#pointers.size === 2) {
      this.#cancelGesture();
      this.#startPinch();
      return;
    }
    if (this.#pointers.size > 2) return;

    event.preventDefault();
    const middleOrSpace = event.button === 1 || event.shiftKey;
    if (middleOrSpace) {
      this.#gesture = { kind: "view-pan", last: point };
      return;
    }

    switch (this.#tool) {
      case "crop":
        this.#beginCropGesture(point);
        break;
      case "select":
        this.#beginSelectGesture(point);
        break;
      case "text":
        this.#createTextLayer(point);
        break;
      default:
        this.#beginDrawGesture(point);
        break;
    }
  };

  #beginCropGesture(point: Point): void {
    const crop = this.#editor.cropRect;
    const handle = this.#hitCropHandle(point, crop);
    if (handle) {
      this.#editor.beginTransaction("Crop");
      this.#gesture = { kind: "crop-resize", handle };
      return;
    }
    const stagePoint = this.screenToStage(point);
    const inside =
      stagePoint.x >= crop.x &&
      stagePoint.x <= crop.x + crop.width &&
      stagePoint.y >= crop.y &&
      stagePoint.y <= crop.y + crop.height;
    if (inside) {
      this.#editor.beginTransaction("Move crop");
      this.#gesture = { kind: "crop-move", last: point };
    } else {
      this.#gesture = { kind: "view-pan", last: point };
    }
  }

  #hitCropHandle(point: Point, crop: Rect): CropHandle | null {
    let best: { handle: CropHandle; distance: number } | null = null;
    for (const handle of CROP_HANDLES) {
      const anchor = handleAnchor(crop, handle);
      const screen = this.stageToScreen(anchor);
      const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
      if (distance <= HANDLE_HIT_RADIUS && (!best || distance < best.distance)) {
        best = { handle, distance };
      }
    }
    return best?.handle ?? null;
  }

  #beginSelectGesture(point: Point): void {
    const imagePoint = this.screenToImage(point);
    const hit = this.#hitLayer(imagePoint);
    this.#editor.select(hit?.id ?? null);
    if (hit) {
      this.#editor.beginTransaction("Move annotation");
      this.#gesture = { kind: "layer-move", id: hit.id, last: point };
    } else {
      this.#gesture = { kind: "view-pan", last: point };
    }
    this.#callbacks.onChange?.();
  }

  /** Topmost layer whose padded bounding box contains the point. */
  #hitLayer(imagePoint: Point): EditorLayer | null {
    const tolerance = this.#editor.document.source.width * 0.01;
    for (let i = this.#editor.document.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.#editor.document.layers[i]!;
      if (!layer.visible || layer.locked) continue;
      const bounds = layerBounds(layer);
      if (
        imagePoint.x >= bounds.x - tolerance &&
        imagePoint.x <= bounds.x + bounds.width + tolerance &&
        imagePoint.y >= bounds.y - tolerance &&
        imagePoint.y <= bounds.y + bounds.height + tolerance
      ) {
        return layer;
      }
    }
    return null;
  }

  #longestEdge(): number {
    const { width, height } = this.#editor.document.source;
    return Math.max(width, height);
  }

  #beginDrawGesture(point: Point): void {
    const origin = this.screenToImage(point);
    const stroke = strokeFor(this.#style, this.#longestEdge());
    const frame: Rect = { x: origin.x, y: origin.y, width: 0, height: 0 };

    this.#editor.beginTransaction("Annotate");
    switch (this.#tool) {
      case "rect": {
        const layer = createRectLayer(frame, { stroke, fill: null });
        this.#editor.addLayer(layer);
        this.#gesture = { kind: "draw-shape", id: layer.id, origin, tool: "rect" };
        break;
      }
      case "redact": {
        const layer = createRectLayer(frame, { stroke: null, fill: "#101114" });
        this.#editor.addLayer(layer);
        this.#gesture = { kind: "draw-shape", id: layer.id, origin, tool: "redact" };
        break;
      }
      case "ellipse": {
        const layer = createEllipseLayer(frame, { stroke, fill: null });
        this.#editor.addLayer(layer);
        this.#gesture = { kind: "draw-shape", id: layer.id, origin, tool: "ellipse" };
        break;
      }
      case "arrow": {
        const layer = createArrowLayer(origin, origin, { stroke });
        this.#editor.addLayer(layer);
        this.#gesture = { kind: "draw-shape", id: layer.id, origin, tool: "arrow" };
        break;
      }
      case "draw": {
        const layer = createPathLayer([origin], { stroke });
        this.#editor.addLayer(layer);
        this.#gesture = { kind: "draw-path", id: layer.id, points: [origin] };
        break;
      }
      default:
        this.#editor.rollbackTransaction();
        this.#gesture = { kind: "none" };
    }
  }

  #createTextLayer(point: Point): void {
    const origin = this.screenToImage(point);
    const layer = createTextLayer(origin, "", {
      color: this.#style.colour,
      fontSize: fontSizeFor(this.#style, this.#longestEdge()),
    });
    this.#editor.addLayer(layer);
    this.tool = "select";
    this.#callbacks.onTextCreated?.(layer.id);
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#editor.ready) return;
    const point = this.#eventPoint(event);
    if (this.#pointers.has(event.pointerId)) this.#pointers.set(event.pointerId, point);

    if (this.#pinch) {
      this.#updatePinch();
      return;
    }
    if (this.#gesture.kind === "none") {
      this.#updateCursor(point);
      return;
    }

    event.preventDefault();
    switch (this.#gesture.kind) {
      case "view-pan": {
        const last = this.#gesture.last;
        this.#pan = { x: this.#pan.x + (point.x - last.x), y: this.#pan.y + (point.y - last.y) };
        this.#gesture.last = point;
        this.#autoFit = false;
        this.invalidate();
        break;
      }
      case "crop-move": {
        const last = this.#gesture.last;
        const from = this.screenToStage(last);
        const to = this.screenToStage(point);
        this.#editor.panCrop({ x: to.x - from.x, y: to.y - from.y });
        this.#gesture.last = point;
        break;
      }
      case "crop-resize":
        this.#editor.dragCropHandle(this.#gesture.handle, this.screenToStage(point), this.#minCropSize);
        break;
      case "layer-move": {
        const last = this.#gesture.last;
        const from = this.screenToImage(last);
        const to = this.screenToImage(point);
        this.#editor.moveLayer(this.#gesture.id, { x: to.x - from.x, y: to.y - from.y });
        this.#gesture.last = point;
        break;
      }
      case "draw-shape":
        this.#updateShape(this.#gesture, this.screenToImage(point), event.shiftKey);
        break;
      case "draw-path": {
        const imagePoint = this.screenToImage(point);
        const previous = this.#gesture.points.at(-1)!;
        // Drop samples the smoothing would not notice; long strokes stay small.
        if (Math.hypot(imagePoint.x - previous.x, imagePoint.y - previous.y) < this.#longestEdge() * 0.002) break;
        this.#gesture.points.push(imagePoint);
        const points = [...this.#gesture.points];
        this.#editor.updateLayer(this.#gesture.id, (layer) =>
          layer.type === "path" ? { ...layer, points } : layer,
        );
        break;
      }
    }
  };

  #updateShape(gesture: { id: string; origin: Point; tool: ToolId }, point: Point, constrain: boolean): void {
    const { origin } = gesture;
    if (gesture.tool === "arrow") {
      const end = constrain ? constrainToAxis(origin, point) : point;
      this.#editor.updateLayer(gesture.id, (layer) => (layer.type === "line" ? { ...layer, to: end } : layer));
      return;
    }

    let width = point.x - origin.x;
    let height = point.y - origin.y;
    if (constrain) {
      const size = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width) * size;
      height = Math.sign(height) * size;
    }
    const frame: Rect = {
      x: width < 0 ? origin.x + width : origin.x,
      y: height < 0 ? origin.y + height : origin.y,
      width: Math.abs(width),
      height: Math.abs(height),
    };
    this.#editor.updateLayer(gesture.id, (layer) =>
      layer.type === "rect" || layer.type === "ellipse" ? { ...layer, frame } : layer,
    );
  }

  #onPointerUp = (event: PointerEvent): void => {
    this.#pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.#pointers.size < 2) this.#pinch = null;
    this.#finishGesture();
  };

  #onPointerCancel = (event: PointerEvent): void => {
    this.#pointers.delete(event.pointerId);
    this.#pinch = null;
    this.#cancelGesture();
  };

  #finishGesture(): void {
    const gesture = this.#gesture;
    this.#gesture = { kind: "none" };
    if (gesture.kind === "none" || gesture.kind === "view-pan") return;

    if (gesture.kind === "draw-shape" || gesture.kind === "draw-path") {
      const layer = this.#editor.document.layers.find((candidate) => candidate.id === gesture.id);
      // A tap with a shape tool leaves a zero-sized layer behind; drop it.
      if (layer && isDegenerate(layer, this.#longestEdge())) {
        this.#editor.rollbackTransaction();
        this.#callbacks.onChange?.();
        return;
      }
    }
    this.#editor.commitTransaction();
    this.#callbacks.onChange?.();
  }

  #cancelGesture(): void {
    if (this.#gesture.kind !== "none" && this.#gesture.kind !== "view-pan") {
      this.#editor.rollbackTransaction();
    }
    this.#gesture = { kind: "none" };
  }

  #updateCursor(point: Point): void {
    if (this.#tool === "crop") {
      const handle = this.#hitCropHandle(point, this.#editor.cropRect);
      this.canvas.style.cursor = handle ? cursorForHandle(handle) : "grab";
      return;
    }
    if (this.#tool === "select") {
      this.canvas.style.cursor = this.#hitLayer(this.screenToImage(point)) ? "move" : "default";
      return;
    }
    this.canvas.style.cursor = "crosshair";
  }

  // --- pinch and wheel -----------------------------------------------------

  #startPinch(): void {
    const [a, b] = [...this.#pointers.values()];
    if (!a || !b) return;
    this.#pinch = {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: this.#zoom,
    };
  }

  #updatePinch(): void {
    const pinch = this.#pinch;
    if (!pinch) return;
    const [a, b] = [...this.#pointers.values()];
    if (!a || !b) return;

    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinch.distance > 0) {
      const target = clamp((pinch.zoom * distance) / pinch.distance, MIN_ZOOM, MAX_ZOOM);
      this.zoomBy(target / this.#zoom, centre);
    }
    this.#pan = { x: this.#pan.x + (centre.x - pinch.centre.x), y: this.#pan.y + (centre.y - pinch.centre.y) };
    pinch.centre = centre;
    this.#autoFit = false;
    this.invalidate();
  }

  #onWheel = (event: WheelEvent): void => {
    if (!this.#editor.ready) return;
    event.preventDefault();
    const point = this.#eventPoint(event);
    // Trackpad pinch arrives as ctrlKey + wheel; plain wheel zooms too, which is
    // what people expect inside a canvas that fills its container.
    const intensity = event.ctrlKey ? 0.01 : 0.0022;
    this.zoomBy(Math.exp(-event.deltaY * intensity), point);
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

function handleAnchor(crop: Rect, handle: CropHandle): Point {
  const x = handle.includes("left") ? 0 : handle.includes("right") ? 1 : 0.5;
  const y = handle.startsWith("top") ? 0 : handle.startsWith("bottom") ? 1 : 0.5;
  return { x: crop.x + crop.width * x, y: crop.y + crop.height * y };
}

function cursorForHandle(handle: CropHandle): string {
  switch (handle) {
    case "top":
    case "bottom":
      return "ns-resize";
    case "left":
    case "right":
      return "ew-resize";
    case "top-left":
    case "bottom-right":
      return "nwse-resize";
    default:
      return "nesw-resize";
  }
}

function constrainToAxis(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return Math.abs(dx) > Math.abs(dy) ? { x: point.x, y: origin.y } : { x: origin.x, y: point.y };
}

function isDegenerate(layer: EditorLayer, longestEdge: number): boolean {
  const minimum = longestEdge * 0.004;
  switch (layer.type) {
    case "rect":
    case "ellipse":
      return layer.frame.width < minimum && layer.frame.height < minimum;
    case "line":
      return Math.hypot(layer.to.x - layer.from.x, layer.to.y - layer.from.y) < minimum;
    case "path":
      return layer.points.length < 2;
    default:
      return false;
  }
}
