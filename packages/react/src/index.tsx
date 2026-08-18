import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
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

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  depth: number;
  inTransaction: boolean;
}

export interface PixenImageEditorProps {
  /** URL, data URL, `File` or `Blob`. */
  src?: string | Blob | null;
  /** A previously saved document, to resume a session. */
  document?: EditorDocument | string | null;
  tools?: (ToolId | ToolDefinition)[];
  aspectRatios?: (number | null | AspectRatioOption)[];
  policy?: ImagePolicy | PresetName | null;
  theme?: "dark" | "light";
  locale?: string;
  format?: ImageFormat;
  quality?: number;
  className?: string;
  style?: CSSProperties;

  onReady?: (editor: Editor) => void;
  onLoad?: (document: EditorDocument) => void;
  /** Fires for every state change, including mid-gesture ones (`transient`). */
  onChange?: (document: EditorDocument, meta: { reason: string; transient: boolean }) => void;
  onHistoryChange?: (state: HistoryState) => void;
  onExport?: (result: ExportResult) => void;
  onError?: (error: PixenError) => void;
}

export interface PixenImageEditorHandle {
  readonly element: PixenImageEditorElement | null;
  readonly editor: Editor | null;
  export(options?: ExportOptions): Promise<ExportResult>;
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
 * React props become element properties and custom events become callbacks —
 * nothing more. The editor engine stays the single source of truth, so React
 * never holds a second copy of the document to drift out of sync. Hosts that
 * want to persist state listen to `onChange` and store what they get.
 */
export const PixenImageEditor = forwardRef<PixenImageEditorHandle, PixenImageEditorProps>(
  function PixenImageEditor(props, ref) {
    const elementRef = useRef<PixenImageEditorElement | null>(null);
    const handlers = useRef(props);
    handlers.current = props;

    useImperativeHandle(
      ref,
      (): PixenImageEditorHandle => ({
        get element() {
          return elementRef.current;
        },
        get editor() {
          return elementRef.current?.editor ?? null;
        },
        export: (options) => {
          const element = elementRef.current;
          if (!element) return Promise.reject(new Error("Pixen: the editor is not mounted"));
          return element.export(options);
        },
        undo: () => elementRef.current?.undo(),
        redo: () => elementRef.current?.redo(),
        reset: () => elementRef.current?.reset(),
        getDocument: () => elementRef.current?.document ?? null,
        setTool: (tool) => {
          if (elementRef.current) elementRef.current.tool = tool;
        },
        zoomToFit: () => elementRef.current?.zoomToFit(),
      }),
      [],
    );

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;

      // Listeners read from a ref so a changing callback identity never forces a
      // re-subscribe — a common source of dropped events in wrapper components.
      const onReady = () => handlers.current.onReady?.(element.editor);
      const onLoad = (event: Event) =>
        handlers.current.onLoad?.((event as CustomEvent<{ document: EditorDocument }>).detail.document);
      const onChange = (event: Event) => {
        const detail = (event as CustomEvent<{ document: EditorDocument; reason: string; transient: boolean }>).detail;
        handlers.current.onChange?.(detail.document, { reason: detail.reason, transient: detail.transient });
      };
      const onHistory = (event: Event) =>
        handlers.current.onHistoryChange?.((event as CustomEvent<HistoryState>).detail);
      const onExport = (event: Event) =>
        handlers.current.onExport?.((event as CustomEvent<ExportResult>).detail);
      const onError = (event: Event) =>
        handlers.current.onError?.((event as CustomEvent<{ error: PixenError }>).detail.error);

      element.addEventListener("pixen-ready", onReady);
      element.addEventListener("pixen-load", onLoad);
      element.addEventListener("pixen-change", onChange);
      element.addEventListener("pixen-history", onHistory);
      element.addEventListener("pixen-export", onExport);
      element.addEventListener("pixen-error", onError);

      return () => {
        element.removeEventListener("pixen-ready", onReady);
        element.removeEventListener("pixen-load", onLoad);
        element.removeEventListener("pixen-change", onChange);
        element.removeEventListener("pixen-history", onHistory);
        element.removeEventListener("pixen-export", onExport);
        element.removeEventListener("pixen-error", onError);
      };
    }, []);

    useEffect(() => {
      const element = elementRef.current;
      if (!element || props.tools === undefined) return;
      element.tools = props.tools;
    }, [props.tools]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element || props.aspectRatios === undefined) return;
      element.aspectRatios = props.aspectRatios;
    }, [props.aspectRatios]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element || props.policy === undefined) return;
      element.policy = props.policy;
    }, [props.policy]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element || !props.src) return;
      // Strings go through the attribute so the element can dedupe reloads;
      // Blobs cannot, so they are loaded imperatively.
      if (typeof props.src === "string") element.setAttribute("src", props.src);
      else void element.load(props.src);
    }, [props.src]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element || !props.document) return;
      element.document = props.document;
    }, [props.document]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      // Releasing decoded bitmaps on unmount is the whole reason this effect
      // exists: without it a route change leaks the full-resolution image.
      return () => element.destroy();
    }, []);

    return createElement("pixen-image-editor", {
      ref: elementRef,
      class: props.className,
      style: props.style,
      theme: props.theme ?? "dark",
      locale: props.locale,
      format: props.format,
      quality: props.quality != null ? String(props.quality) : undefined,
    });
  },
);

export type { ToolDefinition, ToolId, AspectRatioOption } from "@pixen/web";
export type { EditorDocument, ExportResult, ImagePolicy, PresetName } from "@pixen/core";
