import { PixenError, toPixenError } from "../errors/index.js";
import * as commands from "./commands.js";
import type { CropHandle } from "../geometry/crop.js";
import { straightenAngleOf } from "../geometry/straighten.js";
import type { Point, Rect, Size } from "../geometry/types.js";
import type { ResizeIntent } from "../image/resize.js";
import type { DecodeOptions, ImageInput } from "../image/decode.js";
import { cloneDocument, createDocument, effectiveCrop, outputSize, stageRect, stageSize } from "../model/document.js";
import { deserializeDocument, serializeDocument } from "../model/serialize.js";
import type {
  Adjustments,
  EditorDocument,
  EditorLayer,
  FrameSettings,
  ImageFormat,
  OutputSettings,
} from "../model/types.js";
import { DEFAULT_PREVIEW_MAX_SIZE, ResourceManager, type ImageResource } from "../resources/manager.js";
import { exportDocument, resolveOutputFormat, type ExportOptions, type ExportResult } from "../export/pipeline.js";
import { exportVariants, type ExportVariant, type VariantSpec } from "../export/variants.js";
import {
  createTextWatermarkLayer,
  createWatermarkLayer,
  stickerFrame,
  type TextWatermarkOptions,
  type WatermarkOptions,
} from "../export/watermark.js";
import { invert } from "../geometry/matrix.js";
import { transformBounds } from "../geometry/rect.js";
import { imageToStage } from "../geometry/spaces.js";
import { createImageLayer, findLayer } from "../model/layers.js";
import { Emitter, type Unsubscribe } from "../util/emitter.js";
import { DEFAULT_HISTORY_LIMIT, summarise, type HistorySummary } from "./history.js";
import {
  createSession,
  reduce,
  type Intent,
  type SessionEvent,
  type SessionState,
} from "./session/index.js";
import { TaskRunner, tracked } from "./tasks/index.js";
import { editorEmissions, type EditorEvents } from "./events.js";

export interface EditorOptions {
  /** Share a manager to reuse decoded bitmaps across editors. */
  resources?: ResourceManager;
  historyLimit?: number;
  previewMaxSize?: number;
}

export interface MutateOptions {
  /** Label shown for the undo step. */
  label?: string;
  /** Skip history entirely — for gestures already wrapped in a transaction. */
  silent?: boolean;
}

/**
 * The imperative shell around a pure session.
 *
 * This class holds three things a pure function cannot: the current state, the
 * subscribers, and the decoded bitmaps. Every decision it appears to make is
 * delegated to `session.reduce`, so the interesting behaviour is unit-testable
 * without constructing an editor at all — see `engine/session.ts`.
 */
export class Editor {
  readonly resources: ResourceManager;
  readonly #emitter = new Emitter<EditorEvents>();
  /**
   * Announces a failure and hands it back to be thrown.
   *
   * Every async entry point owes the host the same two things when something
   * goes wrong: an error on the event channel, for the interface that is
   * listening, and a rejection, for the caller that is awaiting. Returning the
   * error rather than throwing it keeps `throw this.#fail(...)` readable at the
   * call site and makes it the same helper the task runners report through.
   */
  readonly #fail = (error: PixenError): PixenError => {
    this.#emitter.emit("error", error);
    return error;
  };
  readonly #historyLimit: number;
  #session: SessionState | null = null;
  #ownsResources: boolean;
  #destroyed = false;

  /**
   * The two long-running tasks, each owning its own cancellation and progress.
   *
   * See `TaskRunner`: the editor says what a load or an export *is*, and the
   * runner says what happens around one.
   */
  readonly #loadTask = new TaskRunner<{ replace: boolean }>("load", {
    start: (detail) => this.#emitter.emit("load-start", detail),
    progress: (report) => this.#emitter.emit("load-progress", report),
    abort: (reason) => this.#emitter.emit("load-abort", { reason }),
    fail: this.#fail,
  });
  readonly #exportTask = new TaskRunner<{ format: ImageFormat }>("export", {
    start: (detail) => this.#emitter.emit("export-start", detail),
    progress: (report) => this.#emitter.emit("export-progress", report),
    abort: (reason) => this.#emitter.emit("export-abort", { reason }),
    fail: this.#fail,
  });

  constructor(options: EditorOptions = {}) {
    this.resources =
      options.resources ??
      new ResourceManager({ previewMaxSize: options.previewMaxSize ?? DEFAULT_PREVIEW_MAX_SIZE });
    this.#ownsResources = !options.resources;
    this.#historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  }

  // --- state ---------------------------------------------------------------

  get ready(): boolean {
    return this.#session !== null;
  }

  /** The live session state: document, selection and history, as one value. */
  get session(): SessionState {
    if (!this.#session) {
      throw new PixenError("INVALID_STATE", "No image has been loaded yet. Call load() first.");
    }
    return this.#session;
  }

  /** The live document. Treat it as read-only; dispatch intents to change it. */
  get document(): EditorDocument {
    return this.session.document;
  }

  get resource(): ImageResource {
    return this.resources.require(this.document.source.resourceId);
  }

  get selection(): string | null {
    return this.session.selection;
  }

  get historyState(): HistorySummary {
    return summarise(this.session.history);
  }

  get canUndo(): boolean {
    return this.historyState.canUndo;
  }

  get canRedo(): boolean {
    return this.historyState.canRedo;
  }

  get stageSize(): Size {
    return stageSize(this.document);
  }

  get stageRect(): Rect {
    return stageRect(this.document);
  }

  /** The crop region in stage space; the full stage when no crop is set. */
  get cropRect(): Rect {
    return effectiveCrop(this.document);
  }

  get outputSize(): Size {
    return outputSize(this.document);
  }

  /**
   * The selected layer, or null.
   *
   * Total, unlike `document` and `session`: "nothing is selected" and "nothing
   * is loaded" are the same answer to every caller, and making them differ cost
   * five copies of `editor.ready ? editor.selectedLayer : null` in the UI.
   */
  get selectedLayer(): EditorLayer | null {
    if (!this.#session) return null;
    const id = this.#session.selection;
    if (!id) return null;
    return findLayer(this.#session.document.layers, id);
  }

  on<K extends keyof EditorEvents>(event: K, listener: (payload: EditorEvents[K]) => void): Unsubscribe {
    return this.#emitter.on(event, listener);
  }


  // --- loading -------------------------------------------------------------

  /**
   * Decodes an input, registers it and starts a fresh document.
   *
   * Only one load is ever in flight: starting a second calls off the first, so
   * a host that changes its mind twice does not race two decodes into the same
   * editor and get whichever finished last.
   */
  async load(input: ImageInput, options: DecodeOptions = {}): Promise<EditorDocument> {
    this.#assertAlive();
    return this.#loadTask.run(
      { replace: false },
      { signal: options.signal, code: "INVALID_IMAGE", message: "The image could not be loaded" },
      async (attempt) => {
        const resource = await this.resources.load(input, tracked(options, attempt));
        return this.open(resource);
      },
    );
  }

  /** Calls off a load in flight. True when there was one. */
  cancelLoad(): boolean {
    return this.#loadTask.cancel();
  }

  /**
   * Swaps the pixels under the current edit, keeping the edit and its history.
   *
   * For a round trip through something else — a background remover, an
   * upscaler, a retouching service. The document keeps its crop, its
   * annotations and its undo stack; only the picture underneath changes, and it
   * changes as one undo step.
   */
  async replaceSource(input: ImageInput, options: DecodeOptions = {}): Promise<EditorDocument> {
    this.#assertAlive();
    const previous = this.session.document.source.resourceId;

    return this.#loadTask.run(
      { replace: true },
      { signal: options.signal, code: "INVALID_IMAGE", message: "The image could not be replaced" },
      async (attempt) => {
        const resource = await this.resources.load(input, tracked(options, attempt));
        this.dispatch({
          kind: "transform",
          reason: "replace-source",
          label: "Replace image",
          transform: (document) =>
            commands.replaceSource(document, {
              resourceId: resource.id,
              width: resource.width,
              height: resource.height,
              ...(resource.name ? { name: resource.name } : {}),
              ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
            }),
        });

        // Released after the swap, not before: until the document points at the
        // new bitmap, the old one is still the one being drawn.
        if (this.document.source.resourceId !== previous) this.resources.release(previous);
        return this.document;
      },
    );
  }

  /**
   * Puts the editor back to holding nothing.
   *
   * Not the same as `reset`, which clears the edits and keeps the picture. This
   * lets the picture go — the host is done with it, or is about to show a
   * different one and wants the empty state in between.
   */
  close(): this {
    this.#assertAlive();
    // A load, but not an export. A load in flight is about to fill the editor
    // that is being emptied, so letting it land would undo the close. An export
    // is the opposite: "save and close" is an ordinary thing to ask for, and
    // cancelling it would make the save silently fail.
    this.cancelLoad();
    if (!this.#session) return this;

    const { resourceId } = this.#session.document.source;
    this.#session = null;
    this.resources.release(resourceId);
    this.#emitter.emit("close", undefined);
    return this;
  }

  /**
   * Starts a document from a resource that is already registered — for hosts
   * that decode images themselves or share one bitmap between editors.
   */
  open(resource: ImageResource): EditorDocument {
    this.#assertAlive();
    const document = createDocument({
      resourceId: resource.id,
      width: resource.width,
      height: resource.height,
      ...(resource.name ? { name: resource.name } : {}),
      ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
    });
    return this.#start(document, resource);
  }

  /**
   * Restores a saved document.
   *
   * Documents reference an image by id, and ids do not survive a page reload, so
   * a restore either reuses a resource that is already registered or re-loads the
   * bytes the caller supplies and re-points the document at them.
   */
  async restore(input: unknown, image?: ImageInput, options: DecodeOptions = {}): Promise<EditorDocument> {
    this.#assertAlive();
    // A restore that carries bytes is a load wearing a document: it decodes,
    // it can be called off, and it ends in the same `load` event. Running it
    // through the same task is what makes those three true without repeating
    // the machinery that makes them true.
    return this.#loadTask.run(
      { replace: false },
      { signal: options.signal, code: "INVALID_DOCUMENT", message: "The document could not be restored" },
      async (attempt) => {
        const document = deserializeDocument(input);

        if (this.resources.has(document.source.resourceId)) {
          return this.#start(document, this.resources.require(document.source.resourceId));
        }
        if (image === undefined) {
          throw new PixenError(
            "RESOURCE_MISSING",
            `The document references resource "${document.source.resourceId}", which is not registered. Pass the image bytes as the second argument.`,
            { details: { resourceId: document.source.resourceId } },
          );
        }

        const resource = await this.resources.load(image, tracked(options, attempt));
        return this.#start(
          {
            ...document,
            source: {
              ...document.source,
              resourceId: resource.id,
              width: resource.width,
              height: resource.height,
            },
          },
          resource,
        );
      },
    );
  }

  #start(document: EditorDocument, resource: ImageResource): EditorDocument {
    this.#session = createSession(document, { historyLimit: this.#historyLimit });
    this.#emitter.emit("load", { document: cloneDocument(document), resource });
    this.#emitter.emit("change", { document, reason: "load", transient: false });
    this.#emitter.emit("history", this.historyState);
    return document;
  }

  // --- dispatch ------------------------------------------------------------

  /**
   * The single entry point for state changes. Every method below builds an
   * intent and hands it here; hosts and plugins can do the same.
   */
  dispatch(intent: Intent): this {
    this.#assertAlive();
    const outcome = reduce(this.session, intent);
    if (!outcome.ok) {
      this.#emitter.emit("error", outcome.error);
      throw outcome.error;
    }
    this.#session = outcome.value.state;
    this.#emitEvents(outcome.value.events);
    return this;
  }

  /**
   * Dispatches a list of intents as one step.
   *
   * Intents are data, so "the edits to apply" needs no second vocabulary: a
   * host that wants an image opened already rotated and cropped hands over the
   * same values the interface would have produced, and gets one undo step for
   * the lot. An empty list does nothing rather than recording an empty step.
   */
  dispatchAll(intents: readonly Intent[], label = "Apply edits"): this {
    this.#assertAlive();
    if (intents.length === 0) return this;
    if (intents.length === 1) return this.dispatch(intents[0]!);

    return this.transact(label, () => {
      for (const intent of intents) this.dispatch(intent);
      return this;
    });
  }

  #emitEvents(events: readonly SessionEvent[]): void {
    for (const emission of editorEmissions(events)) {
      // The union is discriminated on `type`, but TypeScript cannot see that
      // the payload still matches once the pair is packed into one value.
      this.#emitter.emit(emission.type, emission.payload as never);
    }
  }

  /** Escape hatch for a command this build's intent union does not model. */
  apply(
    reason: string,
    transform: (document: EditorDocument) => EditorDocument,
    options: MutateOptions = {},
  ): this {
    return this.dispatch({
      kind: "transform",
      reason,
      transform,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.silent === undefined ? {} : { silent: options.silent }),
    });
  }

  /** Replaces the document wholesale — used by hosts driving state themselves. */

  setDocument(document: EditorDocument): this {
    return this.dispatch({ kind: "set-document", document });
  }

  // --- transactions --------------------------------------------------------

  /**
   * Opens a transaction. Every change until `commitTransaction` collapses into a
   * single undo step, which is what makes a drag feel like one action.
   */
  beginTransaction(label: string): this {
    return this.dispatch({ kind: "begin-transaction", label });
  }

  /** Returns whether the gesture actually changed anything. */
  commitTransaction(): boolean {
    const before = this.historyState.depth;
    this.dispatch({ kind: "commit-transaction" });
    return this.historyState.depth > before;
  }

  /** Abandons the gesture and restores the pre-transaction document. */
  rollbackTransaction(): this {
    return this.dispatch({ kind: "rollback-transaction" });
  }

  /** Convenience wrapper: rolls back if the body throws. */
  transact<T>(label: string, body: () => T): T {
    this.beginTransaction(label);
    try {
      const result = body();
      this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      throw error;
    }
  }

  // --- history -------------------------------------------------------------

  undo(): boolean {
    const before = this.document;
    this.dispatch({ kind: "undo" });
    return this.document !== before;
  }

  redo(): boolean {
    const before = this.document;
    this.dispatch({ kind: "redo" });
    return this.document !== before;
  }

  /** Returns the document to its just-loaded state, as one undoable step. */
  reset(): this {
    return this.dispatch({ kind: "reset" });
  }

  // --- transform -----------------------------------------------------------

  rotate(radians: number): this {
    return this.dispatch({ kind: "rotate-by", radians });
  }

  rotateQuarterTurns(turns: number): this {
    return this.dispatch({ kind: "rotate-quarter-turns", turns });
  }

  rotateLeft(): this {
    return this.rotateQuarterTurns(-1);
  }

  /**
   * Sets the straighten angle in radians, clamped to ±45°, and pulls the crop
   * in so the result has no blank corners.
   */
  straighten(radians: number): this {
    return this.dispatch({ kind: "straighten", radians });
  }

  /** The straighten angle the document currently carries. */
  get straightenAngle(): number {
    return straightenAngleOf(this.document.transform.rotation);
  }

  rotateRight(): this {
    return this.rotateQuarterTurns(1);
  }

  flipHorizontal(): this {
    return this.dispatch({ kind: "flip", axis: "x" });
  }

  flipVertical(): this {
    return this.dispatch({ kind: "flip", axis: "y" });
  }

  // --- crop ----------------------------------------------------------------

  /** Headless crop: pass a stage-space rect, an aspect ratio, or both. */
  crop(options: { rect?: Rect | null; aspectRatio?: number | null } = {}): this {
    if (options.aspectRatio !== undefined) this.setAspectRatio(options.aspectRatio);
    if (options.rect !== undefined) this.setCropRect(options.rect);
    return this;
  }

  setCropRect(rect: Rect | null): this {
    return this.dispatch({ kind: "set-crop", rect });
  }

  setAspectRatio(aspectRatio: number | null): this {
    return this.dispatch({ kind: "set-aspect-ratio", ratio: aspectRatio });
  }

  dragCropHandle(handle: CropHandle, pointer: Point, minSize?: number): this {
    return this.dispatch({
      kind: "drag-crop-handle",
      handle,
      pointer,
      ...(minSize === undefined ? {} : { minSize }),
    });
  }

  panCrop(delta: Point): this {
    return this.dispatch({ kind: "pan-crop", delta });
  }

  resetCrop(): this {
    return this.setCropRect(null);
  }

  // --- adjustments and output ---------------------------------------------

  setAdjustments(adjustments: Partial<Adjustments>): this {
    return this.dispatch({ kind: "set-adjustments", adjustments });
  }

  /** Sets the exported pixel size. Accepts the same intent shape as `processImage`. */
  resize(intent: ResizeIntent): this {
    return this.dispatch({ kind: "resize", resize: intent });
  }

  setOutput(output: Partial<OutputSettings>): this {
    return this.dispatch({ kind: "set-output", output });
  }

  setFormat(format: ImageFormat | null): this {
    return this.setOutput({ format });
  }

  setQuality(quality: number): this {
    return this.setOutput({ quality });
  }

  // --- layers --------------------------------------------------------------

  addLayer(layer: EditorLayer, options: { select?: boolean; index?: number } = {}): this {
    return this.dispatch({
      kind: "add-layer",
      layer,
      ...(options.index === undefined ? {} : { index: options.index }),
      ...(options.select === undefined ? {} : { select: options.select }),
    });
  }

  /**
   * Accepts a partial layer, or a function for updates that depend on the
   * current value. The data form is preferred: it is serialisable and replayable.
   */
  updateLayer(
    id: string,
    patch: Partial<EditorLayer> | ((layer: EditorLayer) => EditorLayer),
    options: MutateOptions = {},
  ): this {
    if (typeof patch === "function") {
      return this.apply(
        "layer-update",
        (document) => ({
          ...document,
          layers: document.layers.map((layer) => (layer.id === id ? patch(layer) : layer)),
        }),
        { label: "Edit annotation", ...options },
      );
    }
    return this.dispatch({ kind: "update-layer", id, patch });
  }

  moveLayer(id: string, delta: Point): this {
    return this.dispatch({ kind: "move-layer", id, delta });
  }

  reorderLayer(id: string, index: number): this {
    return this.dispatch({ kind: "reorder-layer", id, index });
  }

  removeLayer(id: string): this {
    return this.dispatch({ kind: "remove-layer", id });
  }

  /**
   * Places a registered bitmap as a watermark. The bitmap must already be in
   * the resource manager — `resources.load()` puts it there.
   */
  addWatermark(options: WatermarkOptions): this {
    return this.addLayer(createWatermarkLayer(this.document.source, options), { select: false });
  }

  /**
   * Places a bitmap in the middle of what is currently cropped.
   *
   * Selected on arrival, because the next thing anyone does with a sticker is
   * move or resize it, and its handles are how.
   */
  addSticker(options: { resourceId: string; size: Size; scale?: number; name?: string }): this {
    const region = transformBounds(
      invert(imageToStage(this.document.source, this.document.transform)),
      effectiveCrop(this.document),
    );
    const frame = stickerFrame(region, options.size, options.scale);
    return this.addLayer(
      createImageLayer(options.resourceId, frame, { name: options.name ?? "sticker" }),
      { select: true },
    );
  }

  /** Sets or clears the border drawn over the finished picture. */
  setFrame(frame: Partial<FrameSettings> | null): this {
    return this.dispatch({ kind: "set-frame", frame });
  }

  /** A text watermark — a credit line — placed by the same arithmetic. */
  addTextWatermark(options: TextWatermarkOptions): this {
    return this.addLayer(createTextWatermarkLayer(this.document.source, options), { select: false });
  }

  select(id: string | null): this {
    return this.dispatch({ kind: "select", id });
  }

  // --- output --------------------------------------------------------------

  async export(options: ExportOptions = {}): Promise<ExportResult> {
    this.#assertAlive();
    return this.#exportTask.run(
      { format: resolveOutputFormat(this.document, options.format) },
      { signal: options.signal, code: "EXPORT_FAILED", message: "The image could not be exported" },
      async (attempt) => {
        const result = await exportDocument(this.document, this.resources, tracked(options, attempt));
        this.#emitter.emit("export", result);
        return result;
      },
    );
  }

  /**
   * Calls off an export in flight. True when there was one.
   *
   * A full-resolution render and encode is the longest thing the editor does,
   * and a host that has navigated away should not have to wait for it.
   */
  cancelExport(): boolean {
    return this.#exportTask.cancel();
  }

  /**
   * The same edit at several sizes, largest first.
   *
   * One picture is rarely one file. The sizes are planned before anything is
   * rendered — see `planVariants` — so a host can show what it is about to get.
   */
  async exportVariants(specs: readonly VariantSpec[], options: ExportOptions = {}): Promise<ExportVariant[]> {
    this.#assertAlive();
    return this.#exportTask.run(
      { format: resolveOutputFormat(this.document, options.format) },
      { signal: options.signal, code: "EXPORT_FAILED", message: "The image could not be exported" },
      (attempt) =>
        exportVariants(this.document, this.resources, specs, tracked(options, attempt)),
    );
  }

  /** JSON-safe snapshot; pair it with `restore` to resume a session. */
  toJSON(): EditorDocument {
    return serializeDocument(this.document);
  }

  // --- lifecycle -----------------------------------------------------------

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    // Both tasks, unlike `close`, which spares an export on purpose: there is
    // no editor left for a finished export to hand its blob back to.
    this.#loadTask.cancel();
    this.#exportTask.cancel();
    if (this.#ownsResources) this.resources.disposeAll();
    else if (this.#session) this.resources.release(this.#session.document.source.resourceId);
    this.#session = null;
    this.#emitter.emit("destroy", undefined);
    this.#emitter.clear();
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new PixenError("INVALID_STATE", "This editor has been destroyed");
    }
  }
}

export function createEditor(options: EditorOptions = {}): Editor {
  return new Editor(options);
}
