/**
 * The video demo, and the fixture the browser suite drives.
 *
 * Everything on this page is the ordinary editor: the same custom element, the
 * same crop and annotation tools. What `@pixen/video` adds is opening a moving
 * source and writing the trimmed part back out, and this page is the smallest
 * thing that exercises both.
 */
import "@pixen/web";
import { commands, type EditorDocument } from "@pixen/core";
import { exportClip, openVideo, supportedRecordingType, type VideoSource } from "@pixen/video";
import { recordSampleClip, SAMPLE_SECONDS } from "./sample-clip.js";

type EditorElement = HTMLElement & {
  editor: {
    document: EditorDocument;
    dispatch(intent: unknown): unknown;
    resources: unknown;
  };
};

const element = document.querySelector<EditorElement>("#editor");
const openButton = document.querySelector<HTMLButtonElement>("#open-sample");
const exportButton = document.querySelector<HTMLButtonElement>("#export-clip");
const clipStatus = document.querySelector<HTMLElement>("#clip-status");
const exportStatus = document.querySelector<HTMLElement>("#export-status");
const result = document.querySelector<HTMLVideoElement>("#result");

let opened: VideoSource | null = null;

function say(node: HTMLElement | null, message: string): void {
  if (node) node.textContent = message;
}

async function openSample(): Promise<void> {
  if (!element || !openButton) return;
  openButton.disabled = true;
  say(clipStatus, `Recording a ${SAMPLE_SECONDS}-second sample — in real time, like the export.`);

  try {
    const blob = await recordSampleClip();
    opened = await openVideo(element.editor as never, blob, { name: "sample.webm" });
    // Trim to the middle second, so the demo opens on something already trimmed.
    element.editor.dispatch({ kind: "set-clip", range: { start: 1, end: 2 } });
    say(clipStatus, `Open: ${opened.duration.toFixed(2)}s, trimmed to the middle second.`);
    if (exportButton) exportButton.disabled = false;
  } catch (error) {
    say(clipStatus, `Could not open the sample: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    openButton.disabled = false;
  }
}

async function exportOpened(): Promise<void> {
  if (!element || !opened || !exportButton) return;
  exportButton.disabled = true;

  try {
    const written = await exportClip(element.editor.document, opened.element, element.editor.resources as never, {
      onProgress: (report) => {
        if (report.stage === "render" && report.total) {
          say(exportStatus, `Recording ${report.loaded.toFixed(1)}s of ${report.total.toFixed(1)}s…`);
        }
      },
    });
    say(
      exportStatus,
      `${written.width}×${written.height}, ${written.duration.toFixed(2)}s, ` +
        `${(written.bytes / 1024).toFixed(1)} KB, ${written.type}`,
    );
    if (result) {
      result.src = URL.createObjectURL(written.blob);
      result.hidden = false;
    }
  } catch (error) {
    say(exportStatus, `Export failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    exportButton.disabled = false;
  }
}

openButton?.addEventListener("click", () => void openSample());
exportButton?.addEventListener("click", () => void exportOpened());

if (supportedRecordingType() === null) {
  say(clipStatus, "This browser cannot record video from a canvas, so there is nothing to demonstrate.");
  if (openButton) openButton.disabled = true;
}

// The browser suite drives this page rather than reaching into the bundle, so
// the two things it cannot get at from the DOM are put where it can.
Object.assign(window as unknown as Record<string, unknown>, {
  pixenVideoDemo: { recordSampleClip, exportClip, openVideo, commands, opened: () => opened },
});
