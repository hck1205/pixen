import { PixenError, toPixenError } from "../errors/index.js";
import type { CropHandle } from "../geometry/crop.js";
import type { Point, Rect, Size } from "../geometry/types.js";
import { resolveSize, type ResizeIntent } from "../image/resize.js";
import type { DecodeOptions, ImageInput } from "../image/decode.js";
import {
  cloneDocument,
  createDocument,
  effectiveCrop,
  outputSize,
  stageRect,
  stageSize,
} from "../model/document.js";
import { deserializeDocument, serializeDocument } from "../model/serialize.js";
import type {
  Adjustments,
  EditorDocument,
  EditorLayer,
  ImageFormat,
  OutputSettings,
} from "../model/types.js";
import { ResourceManager, type ImageResource } from "../resources/manager.js";
import { exportDocument, type ExportOptions, type ExportResult } from "../export/pipeline.js";
import { Emitter, type Unsubscribe } from "../util/emitter.js";
import * as commands from "./commands.js";
import { History, type HistoryState } from "./history.js";

export interface EditorEvents {
  load: { document: EditorDocument; resource: ImageResource };
  change: { document: EditorDocument; reason: string; transient: boolean };
  history: HistoryState;
  selection: { id: string | null };
  error: PixenError;
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
 * The engine, and the single source of truth for editor state.
 *
 * Everything above it — the web component, the framework wrappers, the
 * playground — observes this object and sends it intents. Nothing above it keeps
 * a second copy of the document, which is what avoids the classic two-way
 * binding drift between a framework's state and the editor's.
 */
export class Editor {
  readonly resources: ResourceManager;
  readonly #emitter = new Emitter<EditorEvents>();
  readonly #history: History;
  #document: EditorDocument | null = null;
  #selection: string | null = null;
  #ownsResources: boolean;
  #destroyed = false;

  constructor(options: EditorOptions = {}) {
    this.resources = options.resources ?? new ResourceManager({ previewMaxSize: options.previewMaxSize ?? 2048 });
    this.#ownsResources = !options.resources;
    this.#history = new History({ limit: options.historyLimit ?? 100 });
  }

  // --- state ---------------------------------------------------------------

  get ready(): boolean {
    return this.#document !== null;
  }

  /** The live document. Treat it as read-only; use the commands to change it. */
  get document(): EditorDocument {
    if (!this.#document) {
      throw new PixenError("INVALID_STATE", "No image has been loaded yet. Call load() first.");
    }
    return this.#document;
  }

  get resource(): ImageResource {
    return this.resources.require(this.document.source.resourceId);
  }

  get selection(): string | null {
    return this.#selection;
  }

  get historyState(): HistoryState {
    return this.#history.state();
  }

  get canUndo(): boolean {
    return this.#history.state().canUndo;
  }

  get canRedo(): boolean {
    return this.#history.state().canRedo;
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

  on<K extends keyof EditorEvents>(event: K, listener: (payload: EditorEvents[K]) => void): Unsubscribe {
    return this.#emitter.on(event, listener);
  }

  // --- loading -------------------------------------------------------------

  /** Decodes an input, registers it and starts a fresh document. */
  async load(input: ImageInput, options: DecodeOptions = {}): Promise<EditorDocument> {
    this.#assertAlive();
    try {
      const resource = await this.resources.load(input, options);
      return this.open(resource);
    } catch (cause) {
      const error = toPixenError(cause, "INVALID_IMAGE", "The image could not be loaded");
      this.#emitter.emit("error", error);
      throw error;
    }
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
    this.#document = document;
    this.#selection = null;
    this.#history.clear();
    this.#emitter.emit("load", { document: cloneDocument(document), resource });
    this.#emitChange("load", false);
    this.#emitHistory();
    return document;
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
      return await this.#restore(input, image, options);
    } catch (cause) {
      const error = toPixenError(cause, "INVALID_DOCUMENT", "The document could not be restored");
      this.#emitter.emit("error", error);
      throw error;
    }
  }

  async #restore(input: unknown, image?: ImageInput, options: DecodeOptions = {}): Promise<EditorDocument> {
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
      document.source = {
        ...document.source,
        resourceId: resource.id,
        width: resource.width,
        height: resource.height,
      };
    }

    this.#document = document;
    this.#selection = null;
    this.#history.clear();
    this.#emitter.emit("load", { document: cloneDocument(document), resource: this.resource });
    this.#emitChange("restore", false);
    this.#emitHistory();
    return document;
  }

  // --- mutation core -------------------------------------------------------

  /** Runs a pure command and records it. All public mutations funnel through here. */
  apply(
    reason: string,
    mutate: (document: EditorDocument) => EditorDocument,
    options: MutateOptions = {},
  ): this {
    this.#assertAlive();
    const before = this.document;
    const after = mutate(before);
    if (after === before) return this;

    this.#document = after;
    const transient = this.#history.inTransaction;
    if (!transient && options.silent !== true) {
      this.#history.push(options.label ?? reason, before, after);
      this.#emitHistory();
    }
    this.#emitChange(reason, transient);
    return this;
  }

  /** Replaces the document wholesale — used by hosts driving state themselves. */
  setDocument(document: EditorDocument, options: MutateOptions = {}): this {
    return this.apply("set-document", () => cloneDocument(document), options);
  }

  // --- transactions --------------------------------------------------------

  /**
   * Opens a transaction. Every change until `commitTransaction` collapses into a
   * single undo step, which is what makes a drag feel like one action.
   */
  beginTransaction(label: string): this {
    this.#history.begin(label, this.document);
    this.#emitHistory();
    return this;
  }

  commitTransaction(): boolean {
    const recorded = this.#history.commit(this.document);
    this.#emitHistory();
    if (recorded) this.#emitChange("commit", false);
    return recorded;
  }

  /** Abandons the gesture and restores the pre-transaction document. */
  rollbackTransaction(): this {
    const restored = this.#history.rollback();
    this.#document = restored;
    this.#emitHistory();
    this.#emitChange("rollback", false);
    return this;
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
    this.#assertAlive();
    const document = this.#history.undo();
    if (!document) return false;
    this.#document = document;
    this.#pruneSelection();
    this.#emitHistory();
    this.#emitChange("undo", false);
    return true;
  }

  redo(): boolean {
    this.#assertAlive();
    const document = this.#history.redo();
    if (!document) return false;
    this.#document = document;
    this.#pruneSelection();
    this.#emitHistory();
    this.#emitChange("redo", false);
    return true;
  }

  /** Returns the document to its just-loaded state, as one undoable step. */
  reset(): this {
    return this.apply("reset", commands.resetEdits, { label: "Reset" });
  }

  // --- transform -----------------------------------------------------------

  rotate(radians: number): this {
    return this.apply("rotate", (document) => commands.rotateBy(document, radians), { label: "Rotate" });
  }

  rotateQuarterTurns(turns: number): this {
    return this.apply("rotate", (document) => commands.rotateQuarterTurns(document, turns), { label: "Rotate" });
  }

  rotateLeft(): this {
    return this.rotateQuarterTurns(-1);
  }

  rotateRight(): this {
    return this.rotateQuarterTurns(1);
  }

  flipHorizontal(): this {
    return this.apply("flip", (document) => commands.flip(document, "x"), { label: "Flip horizontal" });
  }

  flipVertical(): this {
    return this.apply("flip", (document) => commands.flip(document, "y"), { label: "Flip vertical" });
  }

  // --- crop ----------------------------------------------------------------

  /** Headless crop: pass a stage-space rect, an aspect ratio, or both. */
  crop(options: { rect?: Rect | null; aspectRatio?: number | null } = {}): this {
    return this.apply(
      "crop",
      (document) => {
        let next = document;
        if (options.aspectRatio !== undefined) next = commands.setAspectRatio(next, options.aspectRatio);
        if (options.rect !== undefined) next = commands.setCrop(next, options.rect);
        return next;
      },
      { label: "Crop" },
    );
  }

  setCropRect(rect: Rect | null): this {
    return this.apply("crop", (document) => commands.setCrop(document, rect), { label: "Crop" });
  }

  setAspectRatio(aspectRatio: number | null): this {
    return this.apply("aspect-ratio", (document) => commands.setAspectRatio(document, aspectRatio), {
      label: "Aspect ratio",
    });
  }

  dragCropHandle(handle: CropHandle, pointer: Point, minSize?: number): this {
    return this.apply("crop-drag", (document) => commands.dragCropHandle(document, handle, pointer, minSize));
  }

  panCrop(delta: Point): this {
    return this.apply("crop-pan", (document) => commands.panCrop(document, delta));
  }

  resetCrop(): this {
    return this.apply("crop", (document) => commands.setCrop(document, null), { label: "Reset crop" });
  }

  // --- adjustments and output ---------------------------------------------

  setAdjustments(adjustments: Partial<Adjustments>): this {
    return this.apply("adjustments", (document) => commands.setAdjustments(document, adjustments), {
      label: "Adjust",
    });
  }

  /** Sets the exported pixel size. Accepts the same intent shape as `processImage`. */
  resize(intent: ResizeIntent): this {
    return this.apply(
      "resize",
      (document) => {
        const target = resolveSize(effectiveCrop(document), intent);
        return commands.setOutput(document, { width: target.width, height: target.height });
      },
      { label: "Resize" },
    );
  }

  setOutput(output: Partial<OutputSettings>): this {
    return this.apply("output", (document) => commands.setOutput(document, output), { label: "Output settings" });
  }

  setFormat(format: ImageFormat | null): this {
    return this.setOutput({ format });
  }

  setQuality(quality: number): this {
    return this.setOutput({ quality });
  }

  // --- layers --------------------------------------------------------------

  addLayer(layer: EditorLayer, options: { select?: boolean } = {}): this {
    this.apply("layer-add", (document) => commands.addLayer(document, layer), { label: "Add annotation" });
    if (options.select !== false) this.select(layer.id);
    return this;
  }

  updateLayer(
    id: string,
    patch: Partial<EditorLayer> | ((layer: EditorLayer) => EditorLayer),
    options: MutateOptions = {},
  ): this {
    return this.apply("layer-update", (document) => commands.updateLayer(document, id, patch), {
      label: "Edit annotation",
      ...options,
    });
  }

  moveLayer(id: string, delta: Point): this {
    return this.apply("layer-move", (document) => commands.moveLayerBy(document, id, delta), {
      label: "Move annotation",
    });
  }

  reorderLayer(id: string, index: number): this {
    return this.apply("layer-reorder", (document) => commands.reorderLayer(document, id, index), {
      label: "Reorder annotation",
    });
  }

  removeLayer(id: string): this {
    this.apply("layer-remove", (document) => commands.removeLayer(document, id), { label: "Delete annotation" });
    if (this.#selection === id) this.select(null);
    return this;
  }

  select(id: string | null): this {
    if (this.#selection === id) return this;
    this.#selection = id;
    this.#emitter.emit("selection", { id });
    return this;
  }

  get selectedLayer(): EditorLayer | null {
    if (!this.#selection) return null;
    return this.document.layers.find((layer) => layer.id === this.#selection) ?? null;
  }

  // --- output --------------------------------------------------------------

  async export(options: ExportOptions = {}): Promise<ExportResult> {
    this.#assertAlive();
    try {
      return await exportDocument(this.document, this.resources, options);
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
    else if (this.#document) this.resources.release(this.#document.source.resourceId);
    this.#document = null;
    this.#history.clear();
    this.#emitter.emit("destroy", undefined);
    this.#emitter.clear();
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  // --- internals -----------------------------------------------------------

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new PixenError("INVALID_STATE", "This editor has been destroyed");
    }
  }

  #pruneSelection(): void {
    if (this.#selection && !this.document.layers.some((layer) => layer.id === this.#selection)) {
      this.select(null);
    }
  }

  #emitChange(reason: string, transient: boolean): void {
    if (!this.#document) return;
    this.#emitter.emit("change", { document: this.#document, reason, transient });
  }

  #emitHistory(): void {
    this.#emitter.emit("history", this.#history.state());
  }
}

export function createEditor(options: EditorOptions = {}): Editor {
  return new Editor(options);
}
