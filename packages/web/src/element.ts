import {
  applyPolicy,
  Editor,
  isPixenError,
  isPristine,
  PixenError,
  type EditorDocument,
  type EditorLayer,
  type ExportOptions,
  type ExportResult,
  type ImageFormat,
  type ImagePolicy,
  type PresetName,
} from "@pixen/core";
import { icons, type IconName } from "./icons.js";
import { isAppleShortcutPlatform, redoLabel, sizeLabel, undoLabel, zoomLabel } from "./labels.js";
import { resolveStrings, type PixenStrings } from "./i18n.js";
import { styles } from "./styles.js";
import { DEFAULT_STYLE, normaliseTools, type AnnotationStyle, type ToolDefinition, type ToolId } from "./tools.js";
import { Viewport } from "./viewport.js";

export interface AspectRatioOption {
  label: string;
  value: number | null;
}

const DEFAULT_RATIOS: AspectRatioOption[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
];

const TOOL_META: Record<ToolId, { icon: IconName; key: keyof PixenStrings; shortcut: string }> = {
  crop: { icon: "crop", key: "crop", shortcut: "c" },
  select: { icon: "select", key: "select", shortcut: "v" },
  rect: { icon: "rectangle", key: "rectangle", shortcut: "r" },
  ellipse: { icon: "ellipse", key: "ellipse", shortcut: "o" },
  arrow: { icon: "arrow", key: "arrow", shortcut: "a" },
  draw: { icon: "draw", key: "draw", shortcut: "d" },
  text: { icon: "text", key: "text", shortcut: "t" },
  redact: { icon: "redact", key: "redact", shortcut: "x" },
};

/**
 * `<pixen-image-editor>` — the distribution unit for Pixen's UI.
 *
 * A custom element works in every framework and in none, so the framework
 * packages stay thin adapters instead of parallel implementations. Simple
 * settings are attributes; anything structured (tools, policies, documents) is a
 * property, because serialising objects through HTML attributes is a trap.
 */
export class PixenImageEditorElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["src", "theme", "locale", "format", "quality", "preset"];
  }

  readonly editor = new Editor();

  #root: ShadowRoot;
  #canvas!: HTMLCanvasElement;
  #viewport: Viewport | null = null;
  #railHost!: HTMLElement;
  #actionsHost!: HTMLElement;
  #inspectorHost!: HTMLElement;
  #emptyHost!: HTMLElement;
  #dropHost!: HTMLElement;
  #busyHost!: HTMLElement;
  #fileInput!: HTMLInputElement;

  #tools: ToolDefinition[] = normaliseTools(null);
  #ratios: AspectRatioOption[] = DEFAULT_RATIOS;
  #annotationStyle: AnnotationStyle = { ...DEFAULT_STYLE };
  #policy: ImagePolicy | PresetName | null = null;
  #strings: PixenStrings = resolveStrings("en");
  #panel: "tool" | "adjust" = "tool";
  #busy = false;
  #pendingSrc: string | null = null;
  #loadToken = 0;
  #statusHost!: HTMLElement;
  /** Readout nodes are updated in place so a drag does not rebuild the chrome. */
  #readouts: { zoom?: HTMLElement; size?: HTMLElement } = {};
  #apple = isAppleShortcutPlatform(typeof navigator === "undefined" ? "" : navigator.platform);
  #unsubscribe: Array<() => void> = [];

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#root.innerHTML = template();
  }

  // --- lifecycle -----------------------------------------------------------

  connectedCallback(): void {
    this.#canvas = this.#root.querySelector("canvas")!;
    this.#railHost = this.#root.querySelector(".rail")!;
    this.#actionsHost = this.#root.querySelector(".actions")!;
    this.#inspectorHost = this.#root.querySelector(".inspector")!;
    this.#emptyHost = this.#root.querySelector(".empty")!;
    this.#dropHost = this.#root.querySelector(".dropzone")!;
    this.#busyHost = this.#root.querySelector(".busy")!;
    this.#fileInput = this.#root.querySelector("input[type=file]")!;
    this.#statusHost = this.#root.querySelector(".status")!;

    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
    if (!this.hasAttribute("theme")) this.setAttribute("theme", "dark");

    this.#viewport = new Viewport(this.#canvas, this.editor, {
      onChange: () => this.#syncUI(),
      onViewChange: () => this.#updateReadouts(),
      onTextCreated: (id) => this.#focusTextField(id),
    });
    this.#viewport.style = this.#annotationStyle;

    this.#unsubscribe.push(
      this.editor.on("change", (event) => {
        this.#emit("pixen-change", { document: event.document, reason: event.reason, transient: event.transient });
        // A drag emits transient changes at pointer speed. Rebuilding the
        // inspector for each one would be wasteful and would steal focus, but
        // the readouts have to keep up — a crop with a stale size is worse than
        // no size at all.
        if (event.transient) this.#updateReadouts();
        else this.#syncUI();
      }),
      this.editor.on("history", (state) => this.#emit("pixen-history", state)),
      this.editor.on("selection", () => this.#syncUI()),
      this.editor.on("error", (error) => this.#emit("pixen-error", { error })),
    );

    this.addEventListener("keydown", this.#onKeyDown);
    // The viewport calls preventDefault() on pointerdown to own the gesture,
    // which also suppresses the browser's focus-on-click. Restore it, or the
    // keyboard shortcuts stop working the moment someone touches the canvas.
    this.addEventListener("pointerdown", this.#onPointerDownFocus, true);
    this.addEventListener("dragover", this.#onDragOver);
    this.addEventListener("dragleave", this.#onDragLeave);
    this.addEventListener("drop", this.#onDrop);
    this.addEventListener("paste", this.#onPaste);
    this.#fileInput.addEventListener("change", this.#onFilePicked);

    this.#renderChrome();
    this.#syncUI();

    if (this.#pendingSrc) {
      const src = this.#pendingSrc;
      this.#pendingSrc = null;
      void this.load(src);
    } else if (this.hasAttribute("src")) {
      void this.load(this.getAttribute("src")!);
    }
    this.#emit("pixen-ready", { editor: this.editor });
  }

  disconnectedCallback(): void {
    // A component can be moved in the DOM, which disconnects and reconnects it.
    // Tear down listeners either way; bitmaps are released only on destroy().
    this.removeEventListener("keydown", this.#onKeyDown);
    this.removeEventListener("pointerdown", this.#onPointerDownFocus, true);
    this.removeEventListener("dragover", this.#onDragOver);
    this.removeEventListener("dragleave", this.#onDragLeave);
    this.removeEventListener("drop", this.#onDrop);
    this.removeEventListener("paste", this.#onPaste);
    this.#viewport?.destroy();
    this.#viewport = null;
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (previous === value) return;
    switch (name) {
      case "src":
        if (value) {
          if (this.#viewport) void this.load(value);
          else this.#pendingSrc = value;
        }
        break;
      case "locale":
        this.#strings = resolveStrings(value);
        this.#renderChrome();
        this.#syncUI();
        break;
      case "format":
        if (this.editor.ready && value) this.editor.setFormat(value as ImageFormat);
        break;
      case "quality":
        if (this.editor.ready && value) this.editor.setQuality(Number(value));
        break;
      case "preset":
        this.policy = (value as PresetName) || null;
        break;
      default:
        this.#syncUI();
    }
  }

  /** Releases decoded bitmaps. Call it when the host is done with the editor. */
  destroy(): void {
    this.#viewport?.destroy();
    this.#viewport = null;
    this.editor.destroy();
  }

  // --- properties ----------------------------------------------------------

  get tools(): ToolDefinition[] {
    return this.#tools;
  }

  set tools(value: unknown) {
    this.#tools = normaliseTools(value);
    const cropOptions = this.#tools.find((tool) => tool.id === "crop")?.options as
      | { ratios?: (number | null)[]; minSize?: number }
      | undefined;
    if (cropOptions?.ratios) this.aspectRatios = cropOptions.ratios;
    if (cropOptions?.minSize && this.#viewport) this.#viewport.minCropSize = cropOptions.minSize;
    this.#renderChrome();
    this.#syncUI();
  }

  get aspectRatios(): AspectRatioOption[] {
    return this.#ratios;
  }

  set aspectRatios(value: (number | null | AspectRatioOption)[]) {
    if (!Array.isArray(value) || value.length === 0) {
      this.#ratios = DEFAULT_RATIOS;
    } else {
      this.#ratios = value.map((entry) =>
        typeof entry === "object" && entry !== null ? entry : { label: ratioLabel(entry), value: entry },
      );
    }
    this.#syncUI();
  }

  get annotationStyle(): AnnotationStyle {
    return this.#annotationStyle;
  }

  set annotationStyle(value: Partial<AnnotationStyle>) {
    this.#annotationStyle = { ...this.#annotationStyle, ...value };
    if (this.#viewport) this.#viewport.style = this.#annotationStyle;
    this.#syncUI();
  }

  get policy(): ImagePolicy | PresetName | null {
    return this.#policy;
  }

  set policy(value: ImagePolicy | PresetName | null) {
    this.#policy = value;
    if (value && this.editor.ready) applyPolicy(this.editor, value);
    this.#syncUI();
  }

  /**
   * The viewport controller, for hosts that need screen/image coordinate
   * mapping — custom overlays, hit tests, or their own zoom controls.
   */
  get viewport(): Viewport | null {
    return this.#viewport;
  }

  get tool(): ToolId {
    return this.#viewport?.tool ?? "crop";
  }

  set tool(value: ToolId) {
    if (this.#viewport) this.#viewport.tool = value;
  }

  /** The current document. Assigning restores a saved session. */
  get document(): EditorDocument | null {
    return this.editor.ready ? this.editor.toJSON() : null;
  }

  set document(value: EditorDocument | string | null) {
    if (!value) return;
    void this.editor.restore(value).catch((error) => this.#emit("pixen-error", { error }));
  }

  get busy(): boolean {
    return this.#busy;
  }

  // --- imperative API ------------------------------------------------------

  async load(input: Parameters<Editor["load"]>[0]): Promise<void> {
    const token = ++this.#loadToken;
    this.#setBusy(true);
    try {
      await this.editor.load(input);
      // A newer load started while this one was decoding: drop the stale result.
      if (token !== this.#loadToken) return;
      if (this.#policy) applyPolicy(this.editor, this.#policy);
      const format = this.getAttribute("format");
      if (format) this.editor.setFormat(format as ImageFormat);
      const quality = this.getAttribute("quality");
      if (quality) this.editor.setQuality(Number(quality));
      this.#emit("pixen-load", { document: this.editor.toJSON() });
    } catch (error) {
      // The editor already emitted this failure; only surface errors raised
      // after the load itself (policy application, attribute parsing).
      if (token === this.#loadToken && !isPixenError(error)) {
        this.#emit("pixen-error", { error: asPixenError(error) });
      }
    } finally {
      if (token === this.#loadToken) {
        this.#setBusy(false);
        this.#syncUI();
      }
    }
  }

  async export(options: ExportOptions = {}): Promise<ExportResult> {
    this.#setBusy(true);
    try {
      const result = await this.editor.export(options);
      this.#emit("pixen-export", result);
      return result;
    } finally {
      this.#setBusy(false);
    }
  }

  undo(): boolean {
    return this.editor.undo();
  }

  redo(): boolean {
    return this.editor.redo();
  }

  reset(): void {
    this.editor.reset();
  }

  rotateLeft(): void {
    this.editor.rotateLeft();
  }

  rotateRight(): void {
    this.editor.rotateRight();
  }

  flipHorizontal(): void {
    this.editor.flipHorizontal();
  }

  flipVertical(): void {
    this.editor.flipVertical();
  }

  zoomToFit(): void {
    this.#viewport?.fit();
  }

  // --- chrome --------------------------------------------------------------

  #renderChrome(): void {
    if (!this.#railHost) return;
    const s = this.#strings;

    this.#railHost.replaceChildren(
      ...this.#tools.map((tool) => {
        const meta = TOOL_META[tool.id];
        if (!meta) return document.createComment(`unknown tool: ${tool.id}`);
        return button({
          icon: meta.icon,
          label: `${s[meta.key]} (${meta.shortcut.toUpperCase()})`,
          keyShortcuts: meta.shortcut,
          onClick: () => {
            this.#panel = "tool";
            this.tool = tool.id;
            this.#announce(s[meta.key]);
          },
          dataset: { tool: tool.id },
        });
      }),
      divider(),
      button({
        icon: "tune",
        label: s.adjustments,
        onClick: () => {
          this.#panel = this.#panel === "adjust" ? "tool" : "adjust";
          this.#announce(this.#panel === "adjust" ? s.adjustments : s[TOOL_META[this.tool]?.key ?? "crop"]);
          this.#syncUI();
        },
        dataset: { panel: "adjust" },
      }),
    );

    this.#actionsHost.setAttribute("aria-label", s.toolbarActions);
    this.#railHost.setAttribute("aria-label", s.toolbarTools);
    this.#inspectorHost.setAttribute("aria-label", s.toolbarOptions);

    this.#actionsHost.replaceChildren(
      button({
        icon: "undo",
        label: undoLabel(s, null, this.#apple),
        onClick: () => this.undo(),
        dataset: { action: "undo" },
        keyShortcuts: "Control+Z Meta+Z",
      }),
      button({
        icon: "redo",
        label: redoLabel(s, null, this.#apple),
        onClick: () => this.redo(),
        dataset: { action: "redo" },
        keyShortcuts: "Control+Shift+Z Meta+Shift+Z",
      }),
      button({ icon: "reset", label: s.reset, onClick: () => this.reset(), dataset: { action: "reset" } }),
      divider(),
      button({
        icon: "download",
        label: s.export,
        text: s.export,
        className: "primary text",
        onClick: () => void this.export().catch(() => undefined),
        dataset: { action: "export" },
      }),
    );

    this.#emptyHost.replaceChildren(
      fragmentFromHTML(icons.image),
      element("h2", { text: s.emptyTitle }),
      element("p", { text: s.emptyBody }),
      button({
        label: s.choose,
        text: s.choose,
        className: "text",
        onClick: () => this.#fileInput.click(),
      }),
    );
    this.#dropHost.textContent = s.dropHint;
  }

  #syncUI(): void {
    if (!this.#railHost) return;
    const ready = this.editor.ready;
    const history = ready ? this.editor.historyState : null;

    this.#emptyHost.hidden = ready;
    this.#canvas.style.visibility = ready ? "visible" : "hidden";

    for (const control of this.#railHost.querySelectorAll<HTMLButtonElement>("button[data-tool]")) {
      control.disabled = !ready;
      control.setAttribute("aria-pressed", String(this.#panel === "tool" && control.dataset.tool === this.tool));
    }
    const adjustButton = this.#railHost.querySelector<HTMLButtonElement>("button[data-panel=adjust]");
    if (adjustButton) {
      adjustButton.disabled = !ready;
      adjustButton.setAttribute("aria-pressed", String(this.#panel === "adjust"));
    }

    setDisabled(this.#actionsHost, "undo", !history?.canUndo);
    setDisabled(this.#actionsHost, "redo", !history?.canRedo);
    // Reset is meaningless on an untouched document, and a live disabled state
    // is a cheaper answer than letting someone press it and see nothing happen.
    setDisabled(this.#actionsHost, "reset", !ready || (ready && isPristine(this.editor.document)));
    setDisabled(this.#actionsHost, "export", !ready || this.#busy);

    relabel(this.#actionsHost, "undo", undoLabel(this.#strings, history, this.#apple));
    relabel(this.#actionsHost, "redo", redoLabel(this.#strings, history, this.#apple));

    this.#readouts = {};
    this.#inspectorHost.replaceChildren(...(ready ? this.#buildInspector() : []));
    this.#updateReadouts();
  }

  /** Cheap text-only refresh, safe to run at pointer speed. */
  #updateReadouts(): void {
    if (!this.editor.ready) return;
    if (this.#readouts.size) this.#readouts.size.textContent = sizeLabel(this.editor.outputSize);
    if (this.#readouts.zoom) this.#readouts.zoom.textContent = zoomLabel(this.#viewport?.zoom ?? 1);
  }

  /** Announces tool changes to assistive technology without moving focus. */
  #announce(message: string): void {
    if (!this.#statusHost) return;
    this.#statusHost.textContent = message;
  }

  #buildInspector(): Node[] {
    const s = this.#strings;
    const contextual = this.#contextualControls();
    // Zoom belongs to the viewport, not to any one tool, so it stays put while
    // the rest of the inspector changes under it.
    return [...contextual, divider(), ...this.#viewControls()];
  }

  #contextualControls(): Node[] {
    const s = this.#strings;
    if (this.#panel === "adjust") return this.#adjustmentControls();

    switch (this.tool) {
      case "crop":
        return this.#cropControls();
      case "select": {
        const layer = this.editor.selectedLayer;
        if (!layer) return [hint(s.select)];
        return this.#layerControls(layer);
      }
      case "text":
        return [hint(s.textPlaceholder), ...this.#styleControls(false)];
      case "redact":
        return [hint(s.redact), ...this.#styleControls(false)];
      default:
        return this.#styleControls(true);
    }
  }

  #viewControls(): Node[] {
    const s = this.#strings;
    const zoom = readout(zoomLabel(this.#viewport?.zoom ?? 1));
    const size = readout(sizeLabel(this.editor.outputSize));
    this.#readouts = { zoom, size };

    return [
      button({ icon: "zoomOut", label: s.zoomOut, onClick: () => this.#viewport?.zoomBy(1 / 1.25) }),
      zoom,
      button({ icon: "zoomIn", label: s.zoomIn, onClick: () => this.#viewport?.zoomBy(1.25) }),
      button({ icon: "fit", label: `${s.zoomFit} (${this.#apple ? "⌘0" : "Ctrl+0"})`, onClick: () => this.zoomToFit() }),
      divider(),
      size,
    ];
  }

  #cropControls(): Node[] {
    const s = this.#strings;
    const current = this.editor.document.aspectRatio;
    const ratioButtons = this.#ratios.map((ratio) =>
      button({
        label: `${s.aspectRatio}: ${ratio.label}`,
        text: ratio.label,
        className: "text",
        active: ratiosEqual(current, ratio.value),
        onClick: () => this.editor.setAspectRatio(ratio.value),
      }),
    );

    return [
      ...ratioButtons,
      divider(),
      button({ icon: "rotateLeft", label: s.rotateLeft, onClick: () => this.rotateLeft() }),
      button({ icon: "rotateRight", label: s.rotateRight, onClick: () => this.rotateRight() }),
      button({ icon: "flipHorizontal", label: s.flipHorizontal, onClick: () => this.flipHorizontal() }),
      button({ icon: "flipVertical", label: s.flipVertical, onClick: () => this.flipVertical() }),
    ];
  }

  #styleControls(includeWidth: boolean): Node[] {
    const s = this.#strings;
    const colour = input({
      type: "color",
      value: this.#annotationStyle.colour,
      onInput: (value) => {
        this.annotationStyle = { colour: value };
        const selected = this.editor.selectedLayer;
        if (selected) this.editor.updateLayer(selected.id, recolour(selected, value));
      },
    });

    const nodes: Node[] = [field(s.strokeColour, colour)];
    if (includeWidth) {
      nodes.push(
        field(
          s.strokeWidth,
          input({
            type: "range",
            min: "0.001",
            max: "0.02",
            step: "0.001",
            value: String(this.#annotationStyle.widthRatio),
            onInput: (value) => {
              this.annotationStyle = { widthRatio: Number(value) };
            },
          }),
        ),
      );
    }
    return nodes;
  }

  #layerControls(layer: EditorLayer): Node[] {
    const s = this.#strings;
    const nodes: Node[] = [];

    if (layer.type === "text") {
      nodes.push(
        field(
          s.text,
          input({
            type: "text",
            value: layer.text,
            placeholder: s.textPlaceholder,
            dataset: { field: "text" },
            onInput: (value) => {
              this.editor.updateLayer(layer.id, (current) =>
                current.type === "text" ? { ...current, text: value } : current,
              );
            },
          }),
        ),
      );
    }

    nodes.push(...this.#styleControls(layer.type !== "text"));
    nodes.push(
      divider(),
      button({
        icon: "trash",
        label: s.delete,
        onClick: () => this.editor.removeLayer(layer.id),
      }),
    );
    return nodes;
  }

  #adjustmentControls(): Node[] {
    const s = this.#strings;
    const { brightness, contrast, saturation } = this.editor.document.adjustments;
    const slider = (label: string, key: "brightness" | "contrast" | "saturation", value: number): Node =>
      field(
        label,
        input({
          type: "range",
          min: "-1",
          max: "1",
          step: "0.01",
          value: String(value),
          onInput: (next) => this.editor.setAdjustments({ [key]: Number(next) }),
          // A slider drag is one gesture, so it collapses into one undo step.
          onPointerDown: () => this.editor.beginTransaction(label),
          onPointerUp: () => this.editor.commitTransaction(),
        }),
      );

    return [
      slider(s.brightness, "brightness", brightness),
      slider(s.contrast, "contrast", contrast),
      slider(s.saturation, "saturation", saturation),
      divider(),
      button({
        icon: "reset",
        label: s.reset,
        onClick: () => this.editor.setAdjustments({ brightness: 0, contrast: 0, saturation: 0 }),
      }),
    ];
  }

  #focusTextField(layerId: string): void {
    this.editor.select(layerId);
    this.#syncUI();
    const field = this.#inspectorHost.querySelector<HTMLInputElement>("input[data-field=text]");
    field?.focus();
  }

  #setBusy(busy: boolean): void {
    this.#busy = busy;
    this.#busyHost.hidden = !busy;
    this.#busyHost.textContent = this.#strings.exporting;
    this.toggleAttribute("busy", busy);
    this.setAttribute("aria-busy", String(busy));
    setDisabled(this.#actionsHost, "export", busy || !this.editor.ready);
  }

  // --- input ---------------------------------------------------------------

  #onPointerDownFocus = (): void => {
    if (this.contains(document.activeElement) || document.activeElement === this) return;
    this.focus({ preventScroll: true });
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.redo();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      const selected = this.editor.selectedLayer;
      if (selected) {
        event.preventDefault();
        this.editor.removeLayer(selected.id);
      }
      return;
    }
    if (event.key === "Escape") {
      this.editor.select(null);
      return;
    }
    if (event.key === "0" && mod) {
      event.preventDefault();
      this.zoomToFit();
      return;
    }

    const arrow = ARROWS[event.key];
    if (arrow) {
      const selected = this.editor.selectedLayer;
      if (!selected || !this.editor.ready) return;
      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) * (this.editor.document.source.width / 500);
      this.editor.moveLayer(selected.id, { x: arrow.x * step, y: arrow.y * step });
      return;
    }

    const tool = this.#tools.find((candidate) => TOOL_META[candidate.id]?.shortcut === event.key.toLowerCase());
    if (tool && !mod) {
      this.#panel = "tool";
      this.tool = tool.id;
    }
  };

  #onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    this.#dropHost.hidden = false;
  };

  #onDragLeave = (event: DragEvent): void => {
    if (event.relatedTarget && this.contains(event.relatedTarget as Node)) return;
    this.#dropHost.hidden = true;
  };

  #onDrop = (event: DragEvent): void => {
    const file = event.dataTransfer?.files?.[0];
    this.#dropHost.hidden = true;
    if (!file) return;
    event.preventDefault();
    void this.load(file);
  };

  #onPaste = (event: ClipboardEvent): void => {
    const item = [...(event.clipboardData?.items ?? [])].find((candidate) => candidate.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void this.load(file);
  };

  #onFilePicked = (): void => {
    const file = this.#fileInput.files?.[0];
    if (file) void this.load(file);
    this.#fileInput.value = "";
  };

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function template(): string {
  return `<style>${styles}</style>
<div class="root" part="root">
  <canvas part="canvas"></canvas>
  <div class="layer">
    <div class="top">
      <slot name="actions"><div class="cluster actions" part="actions" role="toolbar"></div></slot>
    </div>
    <div class="middle">
      <slot name="tools"><div class="cluster rail" part="tool-rail" role="toolbar"></div></slot>
    </div>
    <div class="bottom">
      <slot name="inspector"><div class="cluster inspector" part="inspector"></div></slot>
    </div>
  </div>
  <div class="empty" part="empty"></div>
  <div class="dropzone" part="dropzone" hidden></div>
  <div class="busy" part="busy" role="status" hidden></div>
  <div class="status sr-only" role="status" aria-live="polite"></div>
  <input type="file" accept="image/*" class="sr-only" tabindex="-1" aria-hidden="true">
</div>`;
}

interface ButtonSpec {
  icon?: IconName;
  label: string;
  text?: string;
  className?: string;
  active?: boolean;
  onClick: () => void;
  dataset?: Record<string, string>;
  /** Announced by screen readers as the control's keyboard shortcut. */
  keyShortcuts?: string;
}

function button(spec: ButtonSpec): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.title = spec.label;
  element.setAttribute("aria-label", spec.label);
  if (spec.keyShortcuts) element.setAttribute("aria-keyshortcuts", spec.keyShortcuts);
  if (spec.className) element.className = spec.className;
  if (spec.active) element.classList.add("active");
  if (spec.icon) element.appendChild(fragmentFromHTML(icons[spec.icon]));
  if (spec.text) element.appendChild(document.createTextNode(spec.text));
  for (const [key, value] of Object.entries(spec.dataset ?? {})) element.dataset[key] = value;
  element.addEventListener("click", spec.onClick);
  return element;
}

interface InputSpec {
  type: string;
  value: string;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
  dataset?: Record<string, string>;
  onInput: (value: string) => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}

function input(spec: InputSpec): HTMLInputElement {
  const element = document.createElement("input");
  element.type = spec.type;
  element.value = spec.value;
  if (spec.min !== undefined) element.min = spec.min;
  if (spec.max !== undefined) element.max = spec.max;
  if (spec.step !== undefined) element.step = spec.step;
  if (spec.placeholder) element.placeholder = spec.placeholder;
  for (const [key, value] of Object.entries(spec.dataset ?? {})) element.dataset[key] = value;
  element.addEventListener("input", () => spec.onInput(element.value));
  if (spec.onPointerDown) element.addEventListener("pointerdown", spec.onPointerDown);
  if (spec.onPointerUp) {
    element.addEventListener("pointerup", spec.onPointerUp);
    element.addEventListener("pointercancel", spec.onPointerUp);
  }
  return element;
}

function field(label: string, ...children: Node[]): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.appendChild(document.createTextNode(label));
  for (const child of children) wrapper.appendChild(child);
  return wrapper;
}

function hint(text: string): HTMLElement {
  return element("span", { text, className: "readout" });
}

function readout(text: string): HTMLElement {
  return element("span", { text, className: "readout" });
}

function divider(): HTMLElement {
  return element("span", { className: "divider" });
}

function element(tag: string, options: { text?: string; className?: string } = {}): HTMLElement {
  const node = document.createElement(tag);
  if (options.text) node.textContent = options.text;
  if (options.className) node.className = options.className;
  return node;
}

/** Icons are authored in this package, so the markup is trusted by construction. */
function fragmentFromHTML(markup: string): Node {
  const host = document.createElement("span");
  host.style.display = "contents";
  host.innerHTML = markup;
  return host;
}

/** Keeps a button's tooltip and accessible name in step with the state. */
function relabel(host: HTMLElement, action: string, label: string): void {
  const control = host.querySelector<HTMLButtonElement>(`button[data-action=${action}]`);
  if (!control) return;
  control.title = label;
  control.setAttribute("aria-label", label);
}

function setDisabled(host: HTMLElement, action: string, disabled: boolean): void {
  const control = host.querySelector<HTMLButtonElement>(`button[data-action=${action}]`);
  if (control) control.disabled = disabled;
}

function ratiosEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.0001;
}

function ratioLabel(value: number | null): string {
  if (value === null) return "Free";
  const pairs: Array<[number, string]> = [
    [1, "1:1"],
    [4 / 3, "4:3"],
    [3 / 2, "3:2"],
    [16 / 9, "16:9"],
    [3 / 4, "3:4"],
    [2 / 3, "2:3"],
    [9 / 16, "9:16"],
  ];
  const match = pairs.find(([candidate]) => Math.abs(candidate - value) < 0.0001);
  return match ? match[1] : value.toFixed(2);
}

function recolour(layer: EditorLayer, colour: string): (current: EditorLayer) => EditorLayer {
  return (current) => {
    if (current.id !== layer.id) return current;
    if (current.type === "text") return { ...current, color: colour };
    if (current.type === "line" || current.type === "path") {
      return { ...current, stroke: { ...current.stroke, color: colour } };
    }
    if (current.fill) return { ...current, fill: colour };
    return current.stroke ? { ...current, stroke: { ...current.stroke, color: colour } } : current;
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true;
}

function asPixenError(error: unknown): PixenError {
  return isPixenError(error) ? error : new PixenError("INVALID_IMAGE", "The image could not be loaded", { cause: error });
}
