import {
  applyPolicy,
  Editor,
  isPixenError,
  PixenError,
  type EditorDocument,
  type ExportOptions,
  type ExportResult,
  type ImageFormat,
  type ImagePolicy,
  type PresetName,
} from "@pixen/core";
import { directionFor, resolveStrings, type PixenStrings } from "../i18n/index.js";
import {
  DEFAULT_STYLE,
  normaliseStickers,
  normaliseTools,
  type AnnotationStyle,
  type StickerDefinition,
  type ToolDefinition,
  type ToolId,
} from "../tools/index.js";
import { Viewport, type EdgeBox } from "../viewport/index.js";
import {
  buildActions,
  buildEmptyState,
  buildInspector,
  buildRail,
  refreshActions,
  refreshRail,
  type ChromeActions,
  type ChromeContext,
  type Readouts,
} from "./chrome/index.js";
import { isTypingTarget } from "./dom/index.js";
import { imageFromClipboard, imageFromFiles, carriesFiles } from "./input/transfer.js";
import { nudgeDistance, resolveKeyboardAction } from "./input/keyboard.js";
import { isAppleShortcutPlatform, sizeLabel, zoomLabel } from "./labels.js";
import { normaliseAspectRatios } from "./ratios.js";
import {
  OBSERVED_ATTRIBUTES,
  TOOL_META,
  ZOOM_STEP,
  type AspectRatioOption,
  type ObservedAttribute,
  PANEL_LABEL_KEYS,
  type PanelId,
} from "./constants.js";
import { PluginRegistry, type PixenPlugin } from "../plugins/index.js";
import { StickerPlacer } from "./stickers.js";
import { CanvasTextEditor } from "./text-editing.js";
import { SELECTORS, template } from "./template.js";

/**
 * `HTMLElement` does not exist while a page is being rendered on a server, and
 * `class X extends undefined` throws at module evaluation — which would break
 * every framework with server rendering the moment someone imported this package
 * from a shared module. Extending a stand-in keeps the import safe; the class is
 * only ever instantiated by the browser, which has the real one.
 */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/**
 * `<pixen-image-editor>` — the distribution unit for Pixen's UI.
 *
 * A custom element works in every framework and in none, so the framework
 * packages stay thin adapters instead of parallel implementations. Simple
 * settings are attributes; anything structured (tools, policies, documents) is a
 * property, because serialising objects through HTML attributes is a trap.
 *
 * The class owns the element's lifecycle, its state, and the wiring between the
 * engine and the DOM. What the chrome looks like lives in `chrome/`, what a
 * keystroke means lives in `input/`, and what a gesture means lives in
 * `viewport/` — none of which needs this class to be understood.
 */
export class PixenImageEditorElement extends ElementBase {
  static get observedAttributes(): string[] {
    return [...OBSERVED_ATTRIBUTES];
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
  #statusHost!: HTMLElement;
  #fileInput!: HTMLInputElement;
  #textInput!: HTMLTextAreaElement;
  #textEditing!: CanvasTextEditor;

  #tools: ToolDefinition[] = normaliseTools(null);
  #stickers: StickerDefinition[] = [];
  #stickerPlacer!: StickerPlacer;
  #ratios: AspectRatioOption[] = normaliseAspectRatios(null);
  #annotationStyle: AnnotationStyle = { ...DEFAULT_STYLE };
  #policy: ImagePolicy | PresetName | null = null;
  #strings: PixenStrings = resolveStrings("en");
  #panel: PanelId = "tool";
  #busy = false;
  /** True when the host set `dir` itself, which then outranks the locale. */
  #explicitDirection = false;
  #pendingSrc: string | null = null;
  #loadToken = 0;
  /** Readout nodes are updated in place so a drag does not rebuild the chrome. */
  #readouts: Readouts = {};
  #apple = isAppleShortcutPlatform(typeof navigator === "undefined" ? "" : navigator.platform);
  #unsubscribe: Array<() => void> = [];
  #plugins = new PluginRegistry(() => this.#renderChrome());

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#root.innerHTML = template();
  }

  // --- lifecycle -----------------------------------------------------------

  connectedCallback(): void {
    const find = <T extends Element>(selector: string): T => this.#root.querySelector<T>(selector)!;
    this.#canvas = find(SELECTORS.canvas);
    this.#railHost = find(SELECTORS.rail);
    this.#actionsHost = find(SELECTORS.actions);
    this.#inspectorHost = find(SELECTORS.inspector);
    this.#emptyHost = find(SELECTORS.empty);
    this.#dropHost = find(SELECTORS.dropzone);
    this.#busyHost = find(SELECTORS.busy);
    this.#statusHost = find(SELECTORS.status);
    this.#fileInput = find(SELECTORS.fileInput);
    this.#textInput = find(SELECTORS.textInput);

    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
    if (!this.hasAttribute("theme")) this.setAttribute("theme", "dark");
    this.#explicitDirection = this.hasAttribute("dir");
    this.#applyDirection(this.getAttribute("locale"));

    this.#viewport = new Viewport(this.#canvas, this.editor, {
      onChange: () => this.#syncUI(),
      onViewChange: () => {
        this.#updateReadouts();
        this.#textEditing.reposition();
      },
      onEditText: (id) => this.#textEditing.open(id),
      measureChrome: () => this.#measureChrome(),
    });
    this.#viewport.style = this.#annotationStyle;

    this.#textEditing = new CanvasTextEditor({
      input: this.#textInput,
      editor: this.editor,
      imageToScreen: () => this.#viewport?.imageToScreen() ?? null,
      onClosed: () => this.focus(),
    });
    this.#stickerPlacer = new StickerPlacer({
      editor: this.editor,
      tools: () => this.#tools,
      announce: (message) => this.#announce(message),
      fail: (error) => this.#emit("pixen-error", { error }),
    });
    this.#unsubscribe.push(this.#textEditing.attach());

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
    this.#plugins.dispose();
    this.#viewport?.destroy();
    this.#viewport = null;
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (previous === value) return;
    this.#applyAttribute(name as ObservedAttribute, value);
  }

  /** One place that knows what each observed attribute means. */
  #applyAttribute(name: ObservedAttribute, value: string | null): void {
    switch (name) {
      case "src":
        if (!value) return;
        // Before the viewport exists there is nothing to render into, so the
        // source waits for connectedCallback.
        if (this.#viewport) void this.load(value);
        else this.#pendingSrc = value;
        return;
      case "locale":
        this.#strings = resolveStrings(value);
        this.#applyDirection(value);
        this.#renderChrome();
        this.#syncUI();
        return;
      case "format":
        if (this.editor.ready && value) this.editor.setFormat(value as ImageFormat);
        return;
      case "quality":
        if (this.editor.ready && value) this.editor.setQuality(Number(value));
        return;
      case "preset":
        this.policy = (value as PresetName) || null;
        return;
      case "theme":
        // Themes are pure CSS; the chrome only needs to re-read its state.
        this.#syncUI();
        return;
      default: {
        // Adding an observed attribute without handling it fails to compile.
        const unhandled: never = name;
        void unhandled;
      }
    }
  }

  /** Releases decoded bitmaps. Call it when the host is done with the editor. */
  destroy(): void {
    this.#plugins.dispose();
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
    this.#ratios = normaliseAspectRatios(value);
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

  /**
   * Which inspector panel is open.
   *
   * Settable because a host knows things the editor does not — an application
   * that has just dropped in six annotations can open the layer list, and one
   * that exists to resize can open the output panel and leave it there.
   */
  get panel(): PanelId {
    return this.#panel;
  }

  set panel(value: PanelId) {
    if (this.#panel === value) return;
    this.#panel = value;
    this.#syncUI();
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
        this.#emit("pixen-error", {
          error: new PixenError("INVALID_IMAGE", "The image could not be loaded", { cause: error }),
        });
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

  /** The snapshot the chrome builders read. Rebuilt per render, never cached. */
  #context(): ChromeContext {
    return {
      editor: this.editor,
      strings: this.#strings,
      tools: this.#tools,
      ratios: this.#ratios,
      annotationStyle: this.#annotationStyle,
      panel: this.#panel,
      tool: this.tool,
      zoom: this.#viewport?.zoom ?? 1,
      apple: this.#apple,
      busy: this.#busy,
      stickers: this.#stickers,
      plugins: this.#plugins,
      actions: this.#actions,
    };
  }

  readonly #actions: ChromeActions = {
    selectTool: (tool) => {
      this.#panel = "tool";
      this.tool = tool;
    },
    togglePanel: (panel) => {
      this.#panel = this.#panel === panel ? "tool" : panel;
      this.#announce(this.#panelLabel());
      this.#syncUI();
    },
    setAnnotationStyle: (patch) => {
      this.annotationStyle = patch;
    },
    undo: () => void this.undo(),
    redo: () => void this.redo(),
    reset: () => this.reset(),
    export: () => void this.export().catch(() => undefined),
    zoomBy: (factor) => this.#viewport?.zoomBy(factor),
    zoomToFit: () => this.zoomToFit(),
    chooseFile: () => this.#fileInput.click(),
    placeSticker: (sticker) => {
      void this.#stickerPlacer.place(sticker).then(() => this.#actions.selectTool("select"));
    },
    announce: (message) => this.#announce(message),
  };

  /** Structure that only changes with the tool set or the locale. */
  #renderChrome(): void {
    if (!this.#railHost) return;
    const context = this.#context();
    const { strings } = context;

    this.#railHost.setAttribute("aria-label", strings.toolbarTools);
    this.#actionsHost.setAttribute("aria-label", strings.toolbarActions);
    this.#inspectorHost.setAttribute("aria-label", strings.toolbarOptions);

    this.#railHost.replaceChildren(...buildRail(context));
    this.#actionsHost.replaceChildren(...buildActions(context));
    this.#emptyHost.replaceChildren(...buildEmptyState(context));
    this.#dropHost.textContent = strings.dropHint;
  }

  /** State that changes with the document: pressed, disabled, and the inspector. */
  /** What the panel that just opened is called; the tool panel is its tool. */
  #panelLabel(): string {
    const key = PANEL_LABEL_KEYS[this.#panel] ?? TOOL_META[this.tool]?.key ?? "crop";
    return this.#strings[key];
  }

  #syncUI(): void {
    if (!this.#railHost) return;
    const context = this.#context();
    const ready = this.editor.ready;

    this.#emptyHost.hidden = ready;
    this.#canvas.style.visibility = ready ? "visible" : "hidden";
    // The canvas is the picture, so it is named as one; a canvas with no
    // accessible name is announced as nothing at all.
    this.#canvas.setAttribute(
      "aria-label",
      ready ? `${this.#strings.canvas}, ${sizeLabel(this.editor.outputSize)}` : this.#strings.emptyTitle,
    );

    refreshRail(this.#railHost, context);
    refreshActions(this.#actionsHost, context);

    const inspector = ready ? buildInspector(context) : { nodes: [], readouts: {} };
    this.#readouts = inspector.readouts;
    this.#inspectorHost.replaceChildren(...inspector.nodes);
    this.#updateReadouts();

    // The chrome that was just rebuilt may be a different height — a panel with
    // more controls, or one that wrapped onto another row — so the image is
    // re-fitted around what is actually there now.
    this.#scheduleRefit();
  }

  #refitFrame = 0;

  /** Coalesced to one frame: layout has to settle before the chrome measures. */
  #scheduleRefit(): void {
    if (this.#refitFrame !== 0 || typeof requestAnimationFrame === "undefined") return;
    this.#refitFrame = requestAnimationFrame(() => {
      this.#refitFrame = 0;
      this.#viewport?.refit();
    });
  }

  /** Cheap text-only refresh, safe to run at pointer speed. */
  #updateReadouts(): void {
    if (!this.editor.ready) return;
    if (this.#readouts.size) this.#readouts.size.textContent = sizeLabel(this.editor.outputSize);
    if (this.#readouts.zoom) this.#readouts.zoom.textContent = zoomLabel(this.#viewport?.zoom ?? 1);
  }

  /** Announces changes to assistive technology without moving focus. */
  #announce(message: string): void {
    if (this.#statusHost) this.#statusHost.textContent = message;
  }

  /**
   * The chrome's current rectangles, for fitting the image around them.
   *
   * Read from the live DOM rather than assumed: the inspector's height depends
   * on which panel is open and how many rows it wrapped onto.
   */
  #measureChrome(): { host: EdgeBox; chrome: EdgeBox[] } | null {
    const root = this.#root;
    const host = this.#canvas.getBoundingClientRect();
    const chrome = [...root.querySelectorAll<HTMLElement>(".cluster")]
      .filter((node) => node.offsetParent !== null || node.getClientRects().length > 0)
      .map((node) => node.getBoundingClientRect());
    return { host, chrome };
  }

  /**
   * Mirrors the layout for a right-to-left locale.
   *
   * Only when the host has not said otherwise: a page that has already chosen a
   * direction knows better than a language tag does. The chrome is laid out in
   * logical properties, so `dir` is the whole of the mirroring.
   */
  #applyDirection(locale: string | null): void {
    if (this.#explicitDirection) return;
    this.setAttribute("dir", directionFor(locale));
  }

  // --- plugins -------------------------------------------------------------

  /**
   * Attaches a plugin.
   *
   * Called immediately with the element, the engine and the strings; whatever it
   * returns is run when the element is torn down. A plugin attached before the
   * element connects is applied when it does.
   */
  use(plugin: PixenPlugin): this {
    const teardown = plugin({
      element: this,
      editor: this.editor,
      strings: this.#strings,
      addAction: (action) => this.#plugins.addAction(action),
      addInspectorSection: (section) => this.#plugins.addInspectorSection(section),
    });
    this.#plugins.retain(teardown);
    return this;
  }

  // --- stickers ------------------------------------------------------------

  /** The stickers the sticker tool offers. Pixen ships none of its own. */
  get stickers(): StickerDefinition[] {
    return this.#stickers;
  }

  set stickers(value: unknown) {
    this.#stickers = normaliseStickers(value);
    this.#syncUI();
  }

  #setBusy(busy: boolean): void {
    this.#busy = busy;
    this.#busyHost.hidden = !busy;
    this.#busyHost.textContent = this.#strings.exporting;
    this.toggleAttribute("busy", busy);
    this.setAttribute("aria-busy", String(busy));
    refreshActions(this.#actionsHost, this.#context());
  }

  // --- input ---------------------------------------------------------------

  #onPointerDownFocus = (): void => {
    if (this.contains(document.activeElement) || document.activeElement === this) return;
    this.focus({ preventScroll: true });
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;

    const selected = this.editor.ready ? this.editor.selectedLayer : null;
    const command = resolveKeyboardAction(event, {
      tools: this.#tools,
      hasSelection: selected !== null,
      ready: this.editor.ready,
      textSelected: selected?.type === "text",
    });
    if (!command) return;
    if (command.preventDefault) event.preventDefault();

    const action = command.action;
    switch (action.kind) {
      case "undo":
        this.undo();
        break;
      case "redo":
        this.redo();
        break;
      case "delete-selection":
        if (selected) this.editor.removeLayer(selected.id);
        break;
      case "edit-text": {
        const selected = this.editor.selectedLayer;
        if (selected?.type === "text") {
          this.editor.beginTransaction(this.#strings.text);
          this.#textEditing.open(selected.id);
        }
        break;
      }
      case "clear-selection":
        this.editor.select(null);
        break;
      case "zoom-to-fit":
        this.zoomToFit();
        break;
      case "nudge": {
        if (!selected) break;
        const step = nudgeDistance(this.editor.document.source.width, action.fast);
        this.editor.moveLayer(selected.id, { x: action.direction.x * step, y: action.direction.y * step });
        break;
      }
      case "select-tool":
        this.#actions.selectTool(action.tool);
        break;
    }
  };

  #onDragOver = (event: DragEvent): void => {
    if (!carriesFiles(event.dataTransfer?.types)) return;
    event.preventDefault();
    this.#dropHost.hidden = false;
  };

  #onDragLeave = (event: DragEvent): void => {
    if (event.relatedTarget && this.contains(event.relatedTarget as Node)) return;
    this.#dropHost.hidden = true;
  };

  #onDrop = (event: DragEvent): void => {
    this.#dropHost.hidden = true;
    const file = imageFromFiles(event.dataTransfer?.files);
    if (!file) return;
    event.preventDefault();
    void this.load(file);
  };

  #onPaste = (event: ClipboardEvent): void => {
    const file = imageFromClipboard(event.clipboardData?.items);
    if (!file) return;
    event.preventDefault();
    void this.load(file);
  };

  #onFilePicked = (): void => {
    const file = imageFromFiles(this.#fileInput.files);
    if (file) void this.load(file);
    this.#fileInput.value = "";
  };

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

export { ZOOM_STEP };
