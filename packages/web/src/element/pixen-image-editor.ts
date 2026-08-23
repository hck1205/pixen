import {
  applyPolicy,
  Editor,
  type DecodeOptions,
  type EditorDocument,
  type ExportOptions,
  type ExportResult,
  type ImagePolicy,
  type PresetName,
} from "@pixen/core";
import { directionFor, resolveStrings, type PixenStrings } from "../i18n/index.js";
import {
  DEFAULT_STYLE,
  normaliseStickers,
  cropToolSettings,
  normaliseTools,
  type AnnotationStyle,
  type StickerDefinition,
  type ToolDefinition,
  type ToolId,
} from "../tools/index.js";
import { Viewport } from "../viewport/index.js";
import {
  buildActions,
  buildEmptyState,
  buildInspector,
  buildRail,
  measureChrome,
  refreshActions,
  refreshRail,
  type ChromeActions,
  type ChromeContext,
  type Readouts,
} from "./chrome/index.js";
import { applyAttribute, type AttributePorts } from "./attributes.js";
import { BusyIndicator } from "./busy.js";
import { EditorOperations } from "./operations.js";
import { isTypingTarget } from "./dom/index.js";
import { observeEditor, type ObserverPorts } from "./observe.js";
import { ImageIntake } from "./input/image-intake.js";
import { resolveKeyboardAction } from "./input/keyboard.js";
import { runKeyboardAction, type ActionPorts } from "./input/run-action.js";
import { panelLabel, isAppleShortcutPlatform, sizeLabel, zoomLabel } from "./labels.js";
import { normaliseAspectRatios } from "./ratios.js";
import {
  OBSERVED_ATTRIBUTES,
  ZOOM_STEP,
  type AspectRatioOption,
  type ObservedAttribute,
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
  /**
   * Applied to every load — the file picker, a drop, a paste, the `src`
   * attribute — because a format no browser reads arrives by all of them, not
   * only through a `load()` the host wrote. Options passed to `load()` win.
   */
  decodeOptions: DecodeOptions = {};

  #root: ShadowRoot;
  #canvas!: HTMLCanvasElement;
  #viewport: Viewport | null = null;
  #railHost!: HTMLElement;
  #actionsHost!: HTMLElement;
  #inspectorHost!: HTMLElement;
  #emptyHost!: HTMLElement;
  #dropHost!: HTMLElement;
  #statusHost!: HTMLElement;
  #fileInput!: HTMLInputElement;
  #textInput!: HTMLTextAreaElement;
  #textEditing!: CanvasTextEditor;
  #intake!: ImageIntake;

  #tools: ToolDefinition[] = normaliseTools(null);
  #stickers: StickerDefinition[] = [];
  #stickerPlacer!: StickerPlacer;
  #ratios: AspectRatioOption[] = normaliseAspectRatios(null);
  #annotationStyle: AnnotationStyle = { ...DEFAULT_STYLE };
  #policy: ImagePolicy | PresetName | null = null;
  #strings: PixenStrings = resolveStrings("en");
  #locale: string | null = null;
  #panel: PanelId = "tool";
  #disabled = false;
  /** True when the host set `dir` itself, which then outranks the locale. */
  #explicitDirection = false;
  #pendingSrc: string | null = null;
  /** Readout nodes are updated in place so a drag does not rebuild the chrome. */
  #readouts: Readouts = {};
  #apple = isAppleShortcutPlatform(typeof navigator === "undefined" ? "" : navigator.platform);
  #unsubscribe: Array<() => void> = [];
  #plugins = new PluginRegistry({
    changed: () => this.#renderChrome(),
    locale: () => this.#locale,
  });

  /**
   * What the editor is doing, said out loud. Built here rather than on connect
   * because a framework may set `status` on the property before the element is
   * in the document, and the pill it writes into exists as soon as the template
   * does.
   */
  readonly #busy: BusyIndicator;
  readonly #operations: EditorOperations;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#root.innerHTML = template();
    this.#busy = new BusyIndicator({
      pill: this.#root.querySelector<HTMLElement>(SELECTORS.busy)!,
      strings: () => this.#strings,
      changed: (busy) => {
        this.toggleAttribute("busy", busy);
        this.setAttribute("aria-busy", String(busy));
        // Before connection there is no chrome to rebuild; `connectedCallback`
        // builds it from the state this has already recorded.
        if (this.#actionsHost) refreshActions(this.#actionsHost, this.#context());
      },
    });

    this.#operations = new EditorOperations({
      editor: this.editor,
      busy: this.#busy,
      decodeOptions: () => this.decodeOptions,
      policy: () => this.#policy,
      defaultAspectRatio: () => cropToolSettings(this.#tools).defaultRatio,
      attributePorts: () => this.#attributePorts,
      attribute: (name) => this.getAttribute(name),
      emit: (type, detail) => this.#emit(type, detail),
      refresh: () => this.#syncUI(),
      invalidate: () => this.#viewport?.invalidate(),
    });
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
      measureChrome: () => measureChrome(this.#canvas, this.#root),
    });
    this.#viewport.style = this.#annotationStyle;
    // A fresh viewport starts at the default floor; see `cropToolSettings`.
    this.#viewport.minCropSize = cropToolSettings(this.#tools).minSize;

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

    this.#unsubscribe.push(...observeEditor(this.editor, this.#observerPorts));

    this.addEventListener("keydown", this.#onKeyDown);
    // Capture, so an open caption is finished before the gesture underneath it
    // begins. See `#onPointerDownInside`.
    this.addEventListener("pointerdown", this.#onPointerDownInside, true);

    this.#intake = new ImageIntake({
      host: this,
      dropHost: this.#dropHost,
      fileInput: this.#fileInput,
      open: (file) => void this.load(file),
    });
    this.#unsubscribe.push(this.#intake.attach());

    this.#renderChrome();
    this.#syncUI();

    const src = this.#pendingSrc ?? this.getAttribute("src");
    this.#pendingSrc = null;
    if (src) void this.load(src);
    this.#emit("pixen-ready", { editor: this.editor });
  }

  disconnectedCallback(): void {
    // A component can be moved in the DOM, which disconnects and reconnects it.
    // Tear down listeners either way; bitmaps are released only on destroy().
    this.removeEventListener("keydown", this.#onKeyDown);
    this.removeEventListener("pointerdown", this.#onPointerDownInside, true);
    this.#plugins.dispose();
    this.#viewport?.destroy();
    this.#viewport = null;
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (previous === value) return;
    applyAttribute(name as ObservedAttribute, value, this.#attributePorts);
  }

  /** What the engine's events do to this element. See `observeEditor`. */
  readonly #observerPorts: ObserverPorts = {
    emit: (type, detail) => this.#emit(type, detail),
    refresh: () => this.#syncUI(),
    refreshReadouts: () => this.#updateReadouts(),
    progress: (report) => this.#busy.report(report),
    closed: () => {
      this.#stickerPlacer.clear();
      this.#viewport?.invalidate();
      this.#syncUI();
    },
  };

  /** The effects each observed attribute maps to. See `applyAttribute`. */
  readonly #attributePorts: AttributePorts = {
    mounted: () => this.#viewport !== null,
    ready: () => this.editor.ready,
    load: (src) => void this.load(src),
    defer: (src) => {
      this.#pendingSrc = src;
    },
    setFormat: (format) => this.editor.setFormat(format),
    setQuality: (quality) => this.editor.setQuality(quality),
    setLocale: (locale) => {
      // Kept as the tag, not only as the resolved table: a plugin's own strings
      // are looked up against it, and `ko-KR` has to still find `ko`.
      this.#locale = locale;
      this.#strings = resolveStrings(locale);
      this.#applyDirection(locale);
      this.#renderChrome();
      this.#syncUI();
    },
    setPreset: (preset) => {
      this.policy = preset;
    },
    refresh: () => this.#syncUI(),
  };

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
    const ratios = cropToolSettings(this.#tools).ratios;
    if (ratios) this.aspectRatios = ratios;
    if (this.#viewport) this.#viewport.minCropSize = cropToolSettings(this.#tools).minSize;
    this.#renderChrome();
    this.#syncUI();
  }

  /** The stickers the sticker tool offers. Pixen ships none of its own. */
  get stickers(): StickerDefinition[] {
    return this.#stickers;
  }

  set stickers(value: unknown) {
    this.#stickers = normaliseStickers(value);
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
    return this.#busy.busy;
  }

  /**
   * A message shown over the picture while the host is doing something.
   *
   * The editor puts its own work up there — exporting — but a host round trip
   * takes just as long and is just as invisible: sending the picture to a
   * service and waiting. Setting this says what is happening; setting it to
   * null takes it away.
   */
  get status(): string | null {
    return this.#busy.status;
  }

  set status(value: string | null) {
    this.#busy.status = value;
  }

  /**
   * Blocks input without hiding anything.
   *
   * A host waiting on a round trip needs the picture to stay on screen and stop
   * responding, which is neither `busy` (that is the editor's own work) nor
   * unloading it.
   */
  get disabled(): boolean {
    return this.#disabled;
  }

  set disabled(value: boolean) {
    this.#disabled = value;
    this.toggleAttribute("disabled", value);
    this.setAttribute("aria-disabled", String(value));
    this.#syncUI();
  }

  // --- imperative API ------------------------------------------------------

  /** See `EditorOperations`, which owns the busy state and the load token. */
  async load(input: Parameters<Editor["load"]>[0], options?: DecodeOptions): Promise<void> {
    return this.#operations.load(input, options);
  }

  /** Swaps the pixels under the current edit, keeping the edit. */
  async replaceSource(input: Parameters<Editor["replaceSource"]>[0]): Promise<void> {
    return this.#operations.replaceSource(input);
  }

  /** Back to the empty state, letting the picture go. */
  close(): void {
    this.editor.close();
  }

  async export(options: ExportOptions = {}): Promise<ExportResult> {
    return this.#operations.export(options);
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
      busy: this.busy,
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
      this.#announce(panelLabel(this.#panel, this.tool, this.#strings));
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
    chooseFile: () => this.#intake.choose(),
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
    // The pill reads its strings late, so a locale change reaches it here.
    this.#busy.refresh();

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
      addStrings: (locales) => this.#plugins.addStrings(locales),
    });
    this.#plugins.retain(teardown);
    return this;
  }

  // --- input ---------------------------------------------------------------

  /**
   * The two things a pointerdown would have done by itself.
   *
   * The viewport calls `preventDefault()` to own the gesture, which suppresses
   * the browser's focus-on-click — and with it the blur that ends an open
   * caption. Restoring the focus was done here from the start; the blur was
   * not, so a caption stayed open with its transaction pending. The next
   * gesture then threw on `begin-transaction`, and rolled back a transaction it
   * did not own on the way out: drawing a rectangle after typing a caption
   * deleted the caption.
   *
   * A pointerdown inside the caption's own box is the caret being placed, and
   * ends nothing.
   */
  #onPointerDownInside = (event: PointerEvent): void => {
    if (event.composedPath()[0] !== this.#textInput) this.#textEditing.close();
    if (this.contains(document.activeElement) || document.activeElement === this) return;
    this.focus({ preventScroll: true });
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (this.#disabled || isTypingTarget(event.target)) return;

    const selected = this.editor.selectedLayer;
    const command = resolveKeyboardAction(event, {
      tools: this.#tools,
      hasSelection: selected !== null,
      ready: this.editor.ready,
      textSelected: selected?.type === "text",
    });
    if (!command) return;
    if (command.preventDefault) event.preventDefault();
    runKeyboardAction(command.action, this.#actionPorts);
  };

  /** What a keyboard action is allowed to reach. */
  readonly #actionPorts: ActionPorts = {
    editor: this.editor,
    undo: () => void this.undo(),
    redo: () => void this.redo(),
    zoomToFit: () => this.zoomToFit(),
    selectTool: (tool) => this.#actions.selectTool(tool),
    editText: (layer) => {
      // The transaction is opened by whoever opens the editor, so creating and
      // typing collapse into one undo step — and taken back when no editor
      // opens, because nothing else would ever close it. See `open`.
      this.editor.beginTransaction(this.#strings.text);
      if (!this.#textEditing.open(layer.id)) this.editor.rollbackTransaction();
    },
  };

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

export { ZOOM_STEP };
