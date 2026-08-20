/**
 * What happens around an edit rather than during one.
 *
 * A host sends the picture somewhere and gets a different one back; the editor
 * spends time loading and exporting and has to say so. Both are about the
 * editor's lifecycle rather than its tools, which is why they are here and not
 * next door in `capabilities.stories.tsx`.
 */
import { useRef, useState } from "react";
import type { Editor, ExportHooks, ProgressReport } from "@pixen/core";
import { PixenImageEditor, type PixenImageEditorHandle } from "@pixen/react";
import { seedStyling } from "./fixtures.js";
import { Row, SeededEditor, Stage, formatBytes, useSampleImage } from "./harness.js";
import { hostButton, logList, note, panelTitle } from "./styles.js";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Editor",
} satisfies StoryDefault;

/**
 * The host round trip.
 *
 * Everything a host does between "give me the picture" and "here is a different
 * picture" — a background remover, an upscaler, a retouching service — looks
 * the same from the editor: slow, invisible, and it must not lose the edit.
 * Crop something and draw on it first, then send it: the crop, the marks and
 * the undo stack all survive.
 */
export const RoundTrip: Story = () => {
  const image = useSampleImage();
  const handle = useRef<PixenImageEditorHandle>(null);
  const [log, setLog] = useState<string[]>([]);

  async function roundTrip(): Promise<void> {
    const element = handle.current?.element;
    const editor = handle.current?.editor;
    if (!element || !editor) return;

    const before = {
      layers: editor.document.layers.length,
      depth: editor.historyState.depth,
    };

    // Stands in for the service: the same picture, in monochrome.
    element.status = "Sending to the service…";
    element.disabled = true;
    try {
      const replacement = await monochrome(editor);
      await new Promise((resolve) => setTimeout(resolve, DEMO_SERVICE_DELAY_MS));
      await element.replaceSource(replacement);
      setLog((entries) => [
        ...entries,
        `pixels replaced · ${before.layers} annotation(s) kept · history ${before.depth} → ${editor.historyState.depth}`,
      ]);
    } finally {
      element.status = null;
      element.disabled = false;
    }
  }

  return (
    <Row>
      <Stage
        title="Round trip"
        note="Crop and annotate, then send. The picture underneath changes; the edit does not. Undo puts the original pixels back."
      >
        <SeededEditor image={image} seed={seedStyling} handle={handle} />
      </Stage>
      <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={panelTitle}>Service</h2>
        <p style={note}>
          While it runs the editor is disabled and says so — the picture stays on screen, and nothing responds.
        </p>
        <button type="button" onClick={() => void roundTrip()} style={{ ...hostButton, justifySelf: "start" }}>
          Remove the colour
        </button>
        {log.length === 0 ? (
          <p style={note}>Nothing sent yet.</p>
        ) : (
          <ul style={logList}>
            {log.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </Row>
  );
};

/**
 * What the editor is doing, said out loud.
 *
 * A busy spinner answers "is it working"; it does not answer "is it nearly
 * done", and for a 40-megapixel file over a slow connection those are different
 * questions. Load a picture over the network and the bytes are counted for
 * real; export against a byte budget and the re-encode attempts are counted for
 * real. Everything else reports itself as uncountable rather than making a
 * number up, which is why some rows below have a percentage and some do not.
 */
export const Progress: Story = () => {
  const image = useSampleImage({ width: 3000, height: 2000 });
  const handle = useRef<PixenImageEditorHandle>(null);
  const [log, setLog] = useState<string[]>([]);

  const record = (name: string, report?: ProgressReport): void => {
    const detail = report
      ? ` · ${report.stage} ${report.ratio === null ? "(uncountable)" : `${Math.round(report.ratio * 100)}%`}`
      : "";
    setLog((entries) => [...entries.slice(-PROGRESS_LOG_LIMIT), `${name}${detail}`]);
  };

  async function reload(): Promise<void> {
    const element = handle.current?.element;
    if (!element || !image) return;
    // A URL rather than the blob itself: fetching is the one step of a load
    // whose length a server actually declares.
    const url = URL.createObjectURL(image);
    try {
      await element.load(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function exportBudgeted(): Promise<void> {
    const element = handle.current?.element;
    if (!element) return;
    try {
      const result = await element.export({ format: "image/jpeg", maxBytes: PROGRESS_BUDGET_BYTES });
      record(`done · ${formatBytes(result.bytes)} at quality ${result.quality.toFixed(2)}`);
    } catch {
      // Announced on the event channel already; the log below shows it.
    }
  }

  return (
    <Row>
      <Stage
        title="Progress"
        note="Reload over a URL to see counted bytes, or export against a 150 KB budget to see counted re-encodes. Cancel either."
      >
        <PixenImageEditor
          ref={handle}
          src={image}
          onLoadStart={(detail) => record(detail.replace ? "replace-start" : "load-start")}
          onLoadProgress={(report) => record("load", report)}
          onLoadAbort={(detail) => record(`load-abort · ${detail.reason}`)}
          onExportStart={(detail) => record(`export-start · ${detail.format}`)}
          onExportProgress={(report) => record("export", report)}
          onExportAbort={(detail) => record(`export-abort · ${detail.reason}`)}
          onError={(error) => record(`error · ${error.code}`)}
          style={{ height: "100%" }}
        />
      </Stage>
      <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={panelTitle}>Events</h2>
        <p style={note}>
          Every row is an event a host can listen for. A percentage appears only where something was counted.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void reload()} style={hostButton}>
            Reload over a URL
          </button>
          <button type="button" onClick={() => void exportBudgeted()} style={hostButton}>
            Export to 150 KB
          </button>
          <button
            type="button"
            onClick={() => {
              const editor = handle.current?.editor;
              editor?.cancelLoad();
              editor?.cancelExport();
            }}
            style={hostButton}
          >
            Cancel
          </button>
        </div>
        {log.length === 0 ? (
          <p style={note}>Nothing has happened yet.</p>
        ) : (
          <ul style={logList}>
            {log.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </Row>
  );
};

/** Small enough that a photograph needs several re-encodes to reach it. */
const PROGRESS_BUDGET_BYTES = 150 * 1024;
/** A log that scrolls forever is a log nobody reads. */
const PROGRESS_LOG_LIMIT = 12;

/** How long the pretend service takes, so the disabled state is visible. */
const DEMO_SERVICE_DELAY_MS = 900;

/** Draws the current source in monochrome: a stand-in for a real service. */
async function monochrome(editor: Editor): Promise<Blob> {
  const { width, height } = editor.resource;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.filter = "grayscale(1) contrast(1.1)";
  context.drawImage(editor.resource.source, 0, 0, width, height);
  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
}
