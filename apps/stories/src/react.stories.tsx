import { useRef, useState } from "react";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import type { EditorDocument } from "@pixen/core";
import type { Story, StoryDefault } from "@ladle/react";
import { ResultPanel, Row, Stage, useSampleImage, type ExportSummary } from "./harness.js";
import { codeBlock, hostButton, logList } from "./styles.js";

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
            <button type="button" style={hostButton} onClick={() => setSaved(editor.current?.getDocument() ?? null)}>
              Save
            </button>
            <button type="button" style={hostButton} onClick={() => setInstance((value) => value + 1)}>
              Remount
            </button>
            <button type="button" style={hostButton} onClick={() => setSaved(null)}>
              Clear
            </button>
          </div>
          <pre style={codeBlock}>{saved ? JSON.stringify(saved, null, 2) : "Nothing saved yet."}</pre>
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
        <ol style={logList}>
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



