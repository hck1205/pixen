import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
import type {
  AbortReason,
  Editor,
  EditorDocument,
  ExportOptions,
  ExportResult,
  HistorySummary,
  ImageFormat,
    PixenError,
    ProgressReport,
} from "@pixen/core";
import {
  applyProperty,
  attachEvents,
  type PixenElementProperties,
  type PixenImageEditorElement,
  type ToolId,
} from "@pixen/web";
import "@pixen/web";

export interface PixenImageEditorProps extends PixenElementProperties {
  theme?: "dark" | "light";
  locale?: string;
  format?: ImageFormat;
  quality?: number;
  className?: string;
  style?: CSSProperties;

  onReady?: (editor: Editor) => void;
  onLoadStart?: (detail: { replace: boolean }) => void;
  onLoadProgress?: (report: ProgressReport) => void;
  onLoadAbort?: (detail: { reason: AbortReason }) => void;
  onLoad?: (document: EditorDocument) => void;
  /** Fires for every state change, including mid-gesture ones (`transient`). */
  onChange?: (document: EditorDocument, meta: { reason: string; transient: boolean }) => void;
  onHistoryChange?: (state: HistorySummary) => void;
  onExportStart?: (detail: { format: ImageFormat }) => void;
  onExportProgress?: (report: ProgressReport) => void;
  onExportAbort?: (detail: { reason: AbortReason }) => void;
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
 * never holds a second copy of the document to drift out of sync. The mapping
 * itself lives in `@pixen/web`, shared with the other wrappers.
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

      // Handlers are read from a ref, so a changing callback identity never
      // forces a re-subscribe — a common source of dropped events in wrappers.
      return attachEvents(element, {
        ready: () => handlers.current.onReady?.(element.editor),
        "load-start": (detail) => handlers.current.onLoadStart?.(detail),
        "load-progress": (detail) => handlers.current.onLoadProgress?.(detail),
        "load-abort": (detail) => handlers.current.onLoadAbort?.(detail),
        load: (detail) => handlers.current.onLoad?.(detail.document),
        change: (detail) =>
          handlers.current.onChange?.(detail.document, {
            reason: detail.reason,
            transient: detail.transient,
          }),
        history: (detail) => handlers.current.onHistoryChange?.(detail),
        "export-start": (detail) => handlers.current.onExportStart?.(detail),
        "export-progress": (detail) => handlers.current.onExportProgress?.(detail),
        "export-abort": (detail) => handlers.current.onExportAbort?.(detail),
        export: (detail) => handlers.current.onExport?.(detail),
        error: (detail) => handlers.current.onError?.(detail.error),
      });
    }, []);

    // One effect per structured prop, so each re-applies only when it changes.
    useEffect(() => applyProperty(elementRef.current!, "tools", props.tools), [props.tools]);
    useEffect(() => applyProperty(elementRef.current!, "aspectRatios", props.aspectRatios), [props.aspectRatios]);
    useEffect(() => applyProperty(elementRef.current!, "stickers", props.stickers), [props.stickers]);
    useEffect(() => applyProperty(elementRef.current!, "policy", props.policy), [props.policy]);
    useEffect(() => applyProperty(elementRef.current!, "document", props.document), [props.document]);
    useEffect(() => applyProperty(elementRef.current!, "src", props.src), [props.src]);

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

export type { AspectRatioOption, ToolDefinition, ToolId } from "@pixen/web";
export type { EditorDocument, ExportResult, HistorySummary, ImagePolicy, PresetName } from "@pixen/core";
