import { useRef, useState } from "react";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import type { EditorDocument } from "@pixen/core";
import type { Story, StoryDefault } from "@ladle/react";
import { ResultPanel, Row, Stage, useSampleImage, type ExportSummary } from "./harness.js";

export default {
  title: "React",
} satisfies StoryDefault;

/** The integration most hosts write first: edit, export, show what came back. */
export const ExportFlow: Story = () => {
  const image = useSampleImage();
  const editor = useRef<PixenImageEditorHandle>(null);
  const [result, setResult] = useState<ExportSummary | null>(null);

  return (
    <Row>
      <Stage title="Editor" note="Press Export, or call the handle from your own button.">
        <PixenImageEditor
          ref={editor}
          src={image}
          format="image/webp"
          quality={0.82}
          onExport={(exported) => setResult(exported)}
          style={{ height: "100%" }}
        />
      </Stage>
      <Stage height="auto" title="Result" note="The blob the export pipeline produced, rendered back.">
        <ResultPanel result={result} />
      </Stage>
    </Row>
  );
};

/**
 * Saving a session and resuming it. The document is JSON with no pixels in it,
 * so the image is handed back separately on restore.
 */
export const SaveAndResume: Story = () => {
  const image = useSampleImage();
  const editor = useRef<PixenImageEditorHandle>(null);
  const [saved, setSaved] = useState<EditorDocument | null>(null);
  const [instance, setInstance] = useState(0);

  return (
    <Row>
      <Stage
        title={`Editor (mount #${instance + 1})`}
        note="Crop or annotate, save, then remount — the edits come back."
      >
        <PixenImageEditor
          key={instance}
          ref={editor}
          src={image}
          {...(saved ? { document: saved } : {})}
          style={{ height: "100%" }}
        />
      </Stage>
      <Stage height="auto" title="Stored document">
        <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={button} onClick={() => setSaved(editor.current?.getDocument() ?? null)}>
              Save
            </button>
            <button type="button" style={button} onClick={() => setInstance((value) => value + 1)}>
              Remount
            </button>
            <button type="button" style={button} onClick={() => setSaved(null)}>
              Clear
            </button>
          </div>
          <pre style={pre}>{saved ? JSON.stringify(saved, null, 2) : "Nothing saved yet."}</pre>
        </div>
      </Stage>
    </Row>
  );
};

/**
 * The event stream, which is the clearest way to see how a gesture becomes one
 * undo step: mid-drag changes are marked transient and are not recorded.
 */
export const EventLog: Story = () => {
  const image = useSampleImage();
  const [events, setEvents] = useState<Array<{ reason: string; transient: boolean; at: number }>>([]);

  return (
    <Row>
      <Stage title="Editor" note="Drag a crop handle and watch the log — one commit, many transient steps.">
        <PixenImageEditor
          src={image}
          onChange={(_document, meta) =>
            setEvents((previous) => [{ ...meta, at: previous.length }, ...previous].slice(0, 40))
          }
          style={{ height: "100%" }}
        />
      </Stage>
      <Stage height="auto" title="onChange">
        <ol style={log}>
          {events.map((event) => (
            <li key={event.at} style={{ opacity: event.transient ? 0.55 : 1 }}>
              <code>{event.reason}</code>
              {event.transient ? " · transient" : " · recorded"}
            </li>
          ))}
          {events.length === 0 && <li style={{ opacity: 0.6 }}>No changes yet.</li>}
        </ol>
      </Stage>
    </Row>
  );
};

const button: React.CSSProperties = {
  font: "600 13px/1 system-ui, sans-serif",
  color: "inherit",
  background: "rgba(127,140,170,0.16)",
  border: "1px solid rgba(127,140,170,0.28)",
  borderRadius: 8,
  padding: "9px 12px",
  cursor: "pointer",
};

const pre: React.CSSProperties = {
  margin: 0,
  maxHeight: 420,
  overflow: "auto",
  padding: 12,
  borderRadius: 10,
  background: "rgba(127,140,170,0.12)",
  font: "400 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
  maxWidth: "100%",
};

const log: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 4,
  maxHeight: 420,
  overflow: "auto",
  font: "400 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
};
