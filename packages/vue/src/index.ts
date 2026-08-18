import { defineComponent, h, onBeforeUnmount, ref, watch, type PropType, type Ref } from "vue";
import type {
  Editor,
  EditorDocument,
  ExportOptions,
  ExportResult,
  ImageFormat,
  ImagePolicy,
  PixenError,
  PresetName,
} from "@pixen/core";
import type { AspectRatioOption, PixenImageEditorElement, ToolDefinition, ToolId } from "@pixen/web";
import "@pixen/web";

export interface PixenEditorExposed {
  element: PixenImageEditorElement | null;
  editor: Editor | null;
  exportImage(options?: ExportOptions): Promise<ExportResult>;
  undo(): void;
  redo(): void;
  reset(): void;
  getDocument(): EditorDocument | null;
  setTool(tool: ToolId): void;
  zoomToFit(): void;
}

/**
 * A thin adapter, by design.
 *
 * Vue props become element properties and custom events become emits — nothing
 * more. The editor engine stays the single source of truth, so Vue never holds a
 * second copy of the document to drift out of sync.
 *
 * Vue needs to know the tag is a custom element rather than a component. In a
 * build with the SFC compiler that is `compilerOptions.isCustomElement`; using
 * this component instead, it is already handled.
 */
export const PixenImageEditor = defineComponent({
  name: "PixenImageEditor",

  props: {
    /** URL, data URL, `File` or `Blob`. */
    src: { type: [String, Object] as PropType<string | Blob | null>, default: null },
    /** A previously saved document, to resume a session. */
    document: { type: [Object, String] as PropType<EditorDocument | string | null>, default: null },
    tools: { type: Array as PropType<(ToolId | ToolDefinition)[] | null>, default: null },
    aspectRatios: { type: Array as PropType<(number | null | AspectRatioOption)[] | null>, default: null },
    policy: { type: [Object, String] as PropType<ImagePolicy | PresetName | null>, default: null },
    theme: { type: String as PropType<"dark" | "light">, default: "dark" },
    locale: { type: String, default: undefined },
    format: { type: String as PropType<ImageFormat | undefined>, default: undefined },
    quality: { type: Number, default: undefined },
  },

  emits: {
    ready: (_editor: Editor) => true,
    load: (_document: EditorDocument) => true,
    change: (_document: EditorDocument, _meta: { reason: string; transient: boolean }) => true,
    history: (_state: unknown) => true,
    export: (_result: ExportResult) => true,
    error: (_error: PixenError) => true,
  },

  setup(props, { emit, expose }) {
    const element: Ref<PixenImageEditorElement | null> = ref(null);

    const on = <T,>(type: string, handler: (detail: T) => void) => (event: Event) =>
      handler((event as CustomEvent<T>).detail);

    /** Attached once, when the element mounts; detached on unmount. */
    const attach = (instance: PixenImageEditorElement | null) => {
      if (!instance || instance === element.value) return;
      element.value = instance;

      instance.addEventListener("pixen-ready", () => emit("ready", instance.editor));
      instance.addEventListener(
        "pixen-load",
        on<{ document: EditorDocument }>("pixen-load", (detail) => emit("load", detail.document)),
      );
      instance.addEventListener(
        "pixen-change",
        on<{ document: EditorDocument; reason: string; transient: boolean }>("pixen-change", (detail) =>
          emit("change", detail.document, { reason: detail.reason, transient: detail.transient }),
        ),
      );
      instance.addEventListener("pixen-history", on<unknown>("pixen-history", (detail) => emit("history", detail)));
      instance.addEventListener(
        "pixen-export",
        on<ExportResult>("pixen-export", (detail) => emit("export", detail)),
      );
      instance.addEventListener(
        "pixen-error",
        on<{ error: PixenError }>("pixen-error", (detail) => emit("error", detail.error)),
      );

      applyProperties(instance);
    };

    /** Structured values are properties, not attributes: HTML cannot carry them. */
    const applyProperties = (instance: PixenImageEditorElement) => {
      if (props.tools) instance.tools = props.tools;
      if (props.aspectRatios) instance.aspectRatios = props.aspectRatios;
      if (props.policy !== null) instance.policy = props.policy;
      if (props.document) instance.document = props.document;
      if (typeof props.src === "string") instance.setAttribute("src", props.src);
      else if (props.src) void instance.load(props.src);
    };

    watch(
      () => props.tools,
      (tools) => {
        if (element.value && tools) element.value.tools = tools;
      },
    );
    watch(
      () => props.aspectRatios,
      (ratios) => {
        if (element.value && ratios) element.value.aspectRatios = ratios;
      },
    );
    watch(
      () => props.policy,
      (policy) => {
        if (element.value) element.value.policy = policy;
      },
    );
    watch(
      () => props.document,
      (document) => {
        if (element.value && document) element.value.document = document;
      },
    );
    watch(
      () => props.src,
      (src) => {
        const instance = element.value;
        if (!instance || !src) return;
        if (typeof src === "string") instance.setAttribute("src", src);
        else void instance.load(src);
      },
    );

    onBeforeUnmount(() => {
      // Releasing decoded bitmaps here is the whole reason this hook exists:
      // without it a route change leaks the full-resolution image.
      element.value?.destroy();
      element.value = null;
    });

    const exposed: PixenEditorExposed = {
      get element() {
        return element.value;
      },
      get editor() {
        return element.value?.editor ?? null;
      },
      exportImage: (options) =>
        element.value
          ? element.value.export(options)
          : Promise.reject(new Error("Pixen: the editor is not mounted")),
      undo: () => element.value?.undo(),
      redo: () => element.value?.redo(),
      reset: () => element.value?.reset(),
      getDocument: () => element.value?.document ?? null,
      setTool: (tool) => {
        if (element.value) element.value.tool = tool;
      },
      zoomToFit: () => element.value?.zoomToFit(),
    };
    expose(exposed);

    return () =>
      h("pixen-image-editor", {
        ref: (instance: unknown) => attach(instance as PixenImageEditorElement | null),
        theme: props.theme,
        locale: props.locale,
        format: props.format,
        quality: props.quality === undefined ? undefined : String(props.quality),
      });
  },
});

export default PixenImageEditor;
export type { ToolDefinition, ToolId, AspectRatioOption } from "@pixen/web";
export type { EditorDocument, ExportResult, ImagePolicy, PresetName } from "@pixen/core";
