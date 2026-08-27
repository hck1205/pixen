import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import type { Editor } from "@pixen/core";
import type { PanelId, PixenImageEditorElement, ToolId } from "@pixen/web";
import "@pixen/web";
import { registerBundledLocales } from "@pixen/web";
import { createSampleImage, type SampleOptions } from "./fixtures.js";
import { note, panelTitle, statRow } from "./styles.js";

// Every language, because a demo is where you go to see them. A product would
// import only the ones it ships — see `docs/FRAMEWORKS.md`.
registerBundledLocales();

/** Loads a generated sample once per set of options. */
export function useSampleImage(options: SampleOptions = {}): Blob | null {
  const [image, setImage] = useState<Blob | null>(null);
  const key = `${options.width ?? 0}x${options.height ?? 0}:${options.type ?? "jpeg"}`;

  useEffect(() => {
    let cancelled = false;
    void createSampleImage(options).then((blob) => {
      if (!cancelled) setImage(blob);
    });
    return () => {
      cancelled = true;
    };
    // The key stands in for the options object, which is recreated each render.
  }, [key]);

  return image;
}

/**
 * A value produced once, asynchronously, with the late arrival dropped.
 *
 * Every story that measures something — eight input kinds, five hook calls, the
 * codecs this browser will write — is this shape: run it, hold the result, and
 * do not set state into a story the reader has already navigated away from.
 * There were five copies before the duplication scan counted them.
 */
export function useAsync<T>(factory: () => Promise<T>, deps: unknown[] = []): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    void factory().then((result) => {
      if (!cancelled) setValue(result);
    });
    return () => {
      cancelled = true;
    };
  }, deps);
  return value;
}

/**
 * A blob to show, and the URL to show it with.
 *
 * The blob is the state; the URL is derived from it and released when it stops
 * being current. Both preview panels used to revoke inside a `setState`
 * updater, which React may call more than once and which is supposed to be
 * pure — and neither released the last one when the story unmounted.
 */
export function usePreviewBlob(): [string | null, (blob: Blob) => void] {
  const [blob, setBlob] = useState<Blob | null>(null);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return [url, setBlob];
}

export interface StageProps {
  children: ReactNode;
  /** Height of the editor frame; stories that check layout override it. */
  height?: number | string;
  title?: string;
  note?: string;
  style?: CSSProperties;
}

/**
 * The frame every story sits in: a titled panel with a fixed height, because the
 * editor fills its container and a story with no height would collapse.
 */
export function Stage({ children, height = 560, title, note: noteText, style }: StageProps) {
  return (
    <section style={{ display: "grid", gap: 10, minWidth: 0 }}>
      {(title || noteText) && (
        <header style={{ display: "grid", gap: 2 }}>
          {title && <h2 style={panelTitle}>{title}</h2>}
          {noteText && <p style={note}>{noteText}</p>}
        </header>
      )}
      <div style={{ height, minWidth: 0, ...style }}>{children}</div>
    </section>
  );
}

export function Row({ children, columns = 2 }: { children: ReactNode; columns?: number }) {
  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

/** Renders an export result so a story can show what the pipeline produced. */
export function ResultPanel({ result }: { result: ExportSummary | null }) {
  const url = useMemo(() => (result ? URL.createObjectURL(result.blob) : null), [result]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (!result || !url) {
    return <p style={note}>Export the image to see the result here.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
      <img src={url} alt="Exported result" style={{ maxWidth: "100%", borderRadius: 10, display: "block" }} />
      <dl style={statRow}>
        <div>
          <dt>Size</dt>
          <dd>
            {result.width} × {result.height}
          </dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>{result.format}</dd>
        </div>
        <div>
          <dt>Bytes</dt>
          <dd>{formatBytes(result.bytes)}</dd>
        </div>
      </dl>
    </div>
  );
}

export interface ExportSummary {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


// --- seeded editor ---------------------------------------------------------

export interface SeededEditorProps {
  image: Blob | null;
  /** Runs once the image is loaded, with the engine behind the element. */
  seed: (editor: Editor) => void;
  /**
   * A ref the story keeps, for the stories that seed the document *and* drive
   * the editor themselves. Without one the wiring is identical either way, and
   * a story that needed the handle used to copy the whole element out.
   */
  handle?: RefObject<PixenImageEditorHandle | null>;
  /** Tool to switch to after seeding, for stories about a particular tool. */
  tool?: ToolId;
  /** Inspector panel to open, for stories about a panel rather than a tool. */
  panel?: PanelId;
  height?: string;
}

/**
 * An editor that puts layers into the document as soon as it has an image.
 *
 * Several stories differ only in what they seed, so the wiring — ref, load
 * callback, null guard — lives here rather than being repeated in each of them.
 */
export function SeededEditor({ image, seed, handle, tool, panel, height = "100%" }: SeededEditorProps) {
  const own = useRef<PixenImageEditorHandle>(null);
  const ref = handle ?? own;
  return (
    <PixenImageEditor
      ref={ref}
      src={image}
      onLoad={() => {
        const editor = ref.current?.editor;
        if (editor) seed(editor);
        if (tool) ref.current?.setTool(tool);
        if (panel && ref.current?.element) ref.current.element.panel = panel;
      }}
      style={{ height }}
    />
  );
}

// --- raw custom element ----------------------------------------------------

export interface ElementEditorProps {
  image: Blob | null;
  /** Attributes passed straight to the custom element. */
  attributes?: Record<string, string>;
  /** Slotted content — the story's own toolbar, actions or inspector. */
  children?: ReactNode;
  onElement?: (element: PixenImageEditorElement) => void;
}

/**
 * The element as a host would use it in plain HTML, for the stories that
 * exercise slots, parts and attributes rather than the React props.
 */
export function ElementEditor({ image, attributes = {}, children, onElement }: ElementEditorProps) {
  const ref = useRef<PixenImageEditorElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !image) return;
    void element.load(image);
    onElement?.(element);
  }, [image]);

  return createElement(
    "pixen-image-editor",
    { ref, style: { width: "100%", height: "100%", display: "block" }, ...attributes },
    children,
  );
}
