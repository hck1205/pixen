import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { PixenImageEditorElement } from "@pixen/web";
import "@pixen/web";
import { createSampleImage, type SampleOptions } from "./fixtures.js";

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

export function useBlob(factory: () => Promise<Blob>, deps: unknown[] = []): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let cancelled = false;
    void factory().then((value) => {
      if (!cancelled) setBlob(value);
    });
    return () => {
      cancelled = true;
    };
  }, deps);
  return blob;
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
export function Stage({ children, height = 560, title, note, style }: StageProps) {
  return (
    <section style={{ display: "grid", gap: 10, minWidth: 0 }}>
      {(title || note) && (
        <header style={{ display: "grid", gap: 2 }}>
          {title && <h2 style={styles.title}>{title}</h2>}
          {note && <p style={styles.note}>{note}</p>}
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
    return <p style={styles.note}>Export the image to see the result here.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
      <img src={url} alt="Exported result" style={{ maxWidth: "100%", borderRadius: 10, display: "block" }} />
      <dl style={styles.stats}>
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

const styles = {
  title: {
    margin: 0,
    font: "600 13px/1.4 system-ui, sans-serif",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    opacity: 0.7,
  },
  note: { margin: 0, font: "400 13px/1.5 system-ui, sans-serif", opacity: 0.65, maxWidth: "70ch" },
  stats: {
    margin: 0,
    display: "flex",
    gap: 18,
    font: "400 12px/1.4 system-ui, sans-serif",
    opacity: 0.8,
  },
} satisfies Record<string, CSSProperties>;

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
