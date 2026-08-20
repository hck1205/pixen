import { PixenError, toPixenError } from "../errors/index.js";
import { chainAbort } from "../util/abort.js";
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
import { exportDocument, type ExportOptions, type ExportResult } from "../export/pipeline.js";
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

export interface EditorEvents {
  load: { document: EditorDocument; resource: ImageResource };
  change: { document: EditorDocument; reason: string; transient: boolean };
  history: HistorySummary;
  selection: { id: string | null };
  error: PixenError;
  /** The image was closed; the editor is back to holding nothing. */
  close: void;
  destroy: void;
}

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
  readonly #historyLimit: number;
  #session: SessionState | null = null;
  #ownsResources: boolean;
  #destroyed = false;
  /** In-flight work, so a host can call it off. See `cancelLoad`/`cancelExport`. */
  #loading: AbortController | null = null;
  #exporting: AbortController | null = null;

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
    this.#loading?.abort();
    const attempt = chainAbort(options.signal);
    this.#loading = attempt;

    try {
      const resource = await this.resources.load(input, { ...options, signal: attempt.signal });
      return this.open(resource);
    } catch (cause) {
      const error = toPixenError(cause, "INVALID_IMAGE", "The image could not be loaded");
      this.#emitter.emit("error", error);
      throw error;
    } finally {
      if (this.#loading === attempt) this.#loading = null;
    }
  }

  /** Calls off a load in flight. True when there was one. */
  cancelLoad(): boolean {
    if (!this.#loading) return false;
    this.#loading.abort();
    this.#loading = null;
    return true;
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

    try {
      const resource = await this.resources.load(input, options);
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
    } catch (cause) {
      const error = toPixenError(cause, "INVALID_IMAGE", "The image could not be replaced");
      this.#emitter.emit("error", error);
      throw error;
    }
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
    try {
      const document = deserializeDocument(input);

      if (!this.resources.has(document.source.resourceId)) {
        if (image === undefined) {
          throw new PixenError(
            "RESOURCE_MISSING",
            `The document references resource "${document.source.resourceId}", which is not registered. Pass the image bytes as the second argument.`,
            { details: { resourceId: document.source.resourceId } },
          );
        }
        const resource = await this.resources.load(image, options);
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
      }

      return this.#start(document, this.resources.require(document.source.resourceId));
    } catch (cause) {
      const error = toPixenError(cause, "INVALID_DOCUMENT", "The document could not be restored");
      this.#emitter.emit("error", error);
      throw error;
    }
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
    for (const event of events) {
      switch (event.type) {
        case "change":
          this.#emitter.emit("change", {
            document: event.document,
            reason: event.reason,
            transient: event.transient,
          });
          break;
        case "history":
          this.#emitter.emit("history", event.summary);
          break;
        case "selection":
          this.#emitter.emit("selection", { id: event.id });
          break;
      }
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
    const attempt = chainAbort(options.signal);
    this.#exporting = attempt;

    try {
      return await exportDocument(this.document, this.resources, { ...options, signal: attempt.signal });
    } catch (cause) {
      const error = toPixenError(cause, "EXPORT_FAILED", "The image could not be exported");
      this.#emitter.emit("error", error);
      throw error;
    } finally {
      if (this.#exporting === attempt) this.#exporting = null;
    }
  }

  /**
   * Calls off an export in flight. True when there was one.
   *
   * A full-resolution render and encode is the longest thing the editor does,
   * and a host that has navigated away should not have to wait for it.
   */
  cancelExport(): boolean {
    if (!this.#exporting) return false;
    this.#exporting.abort();
    this.#exporting = null;
    return true;
  }

  /**
   * The same edit at several sizes, largest first.
   *
   * One picture is rarely one file. The sizes are planned before anything is
   * rendered — see `planVariants` — so a host can show what it is about to get.
   */
  async exportVariants(specs: readonly VariantSpec[], options: ExportOptions = {}): Promise<ExportVariant[]> {
    this.#assertAlive();
    try {
      return await exportVariants(this.document, this.resources, specs, options);
    } catch (cause) {
      const error = toPixenError(cause, "EXPORT_FAILED", "The image could not be exported");
      this.#emitter.emit("error", error);
      throw error;
    }
  }

  /** JSON-safe snapshot; pair it with `restore` to resume a session. */
  toJSON(): EditorDocument {
    return serializeDocument(this.document);
  }

  // --- lifecycle -----------------------------------------------------------

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
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
