import { defineComponent, h, onBeforeUnmount, ref, watch, type PropType, type Ref } from "vue";
import type {
  Editor,
  EditorDocument,
  ExportOptions,
  ExportResult,
  HistorySummary,
  ImageFormat,
  ImagePolicy,
  PixenError,
  PresetName,
} from "@pixen/core";
import {
  applyProperties,
  applyProperty,
  attachEvents,
  type AspectRatioOption,
  type PixenElementProperties,
  type PixenImageEditorElement,
  type StickerDefinition,
  type ToolDefinition,
  type ToolId,
} from "@pixen/web";
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
 * more. The mapping itself lives in `@pixen/web`, shared with the other
 * wrappers, so the two cannot drift apart.
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
    stickers: { type: Array as PropType<(string | Blob | StickerDefinition)[] | null>, default: null },
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
    history: (_state: HistorySummary) => true,
    export: (_result: ExportResult) => true,
    error: (_error: PixenError) => true,
  },

  setup(props, { emit, expose }) {
    const element: Ref<PixenImageEditorElement | null> = ref(null);
    let detach: (() => void) | null = null;

    const attach = (instance: PixenImageEditorElement | null): void => {
      if (!instance || instance === element.value) return;
      element.value = instance;

      detach?.();
      detach = attachEvents(instance, {
        ready: () => emit("ready", instance.editor),
        load: (detail) => emit("load", detail.document),
        change: (detail) => emit("change", detail.document, { reason: detail.reason, transient: detail.transient }),
        history: (detail) => emit("history", detail),
        export: (detail) => emit("export", detail),
        error: (detail) => emit("error", detail.error),
      });

      applyProperties(instance, props as PixenElementProperties);
    };

    // One watcher per structured prop, each re-applying only what changed.
    const bind = <K extends keyof PixenElementProperties>(key: K): void => {
      watch(
        () => props[key] as PixenElementProperties[K],
        (value) => {
          if (element.value) applyProperty(element.value, key, value);
        },
      );
    };
    (["tools", "aspectRatios", "stickers", "policy", "document", "src"] as const).forEach(bind);

    onBeforeUnmount(() => {
      detach?.();
      detach = null;
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
        element.value ? element.value.export(options) : Promise.reject(new Error("Pixen: the editor is not mounted")),
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
export type { AspectRatioOption, StickerDefinition, ToolDefinition, ToolId } from "@pixen/web";
export type { EditorDocument, ExportResult, HistorySummary, ImagePolicy, PresetName } from "@pixen/core";
