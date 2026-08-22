/**
 * How a picture reaches the editor, and what the editor says while it is
 * arriving.
 *
 * One slice of the coverage table. See `index.ts` for what the table is and the
 * rules it is kept honest by.
 */
import { browser, doc, list, story, unit, type CoverageGroup } from "./evidence.js";
import { } from "@pixen/core";
import { PIXEN_EVENTS } from "@pixen/web";

/**
 * Read from the binding list rather than retyped, so an event that reaches the
 * wrappers reaches this page too — and one that is removed disappears from it.
 */
const TASK_EVENTS = PIXEN_EVENTS.filter((name) => name.includes("-"));

export const INTAKE_COVERAGE: CoverageGroup[] = [
  {
    title: "Getting an image in",
    summary: "Every way a picture reaches the editor, and what is read off it on the way.",
    entries: [
      {
        capability: "Input types",
        layer: "Engine",
        detail: "File, Blob, URL string, ImageBitmap, HTMLImageElement, HTMLCanvasElement, ArrayBuffer",
        evidence: [unit("editor.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Drag and drop, paste, file picker",
        layer: "Element",
        detail: "Drop anywhere on the host, ⌘/Ctrl+V, and the empty state's own button",
        evidence: [unit("transfer.test.ts"), story("EmptyState")],
      },
      {
        capability: "Reader hooks",
        layer: "Engine",
        detail:
          "beforeDecode takes bytes no browser reads — HEIC is the case it exists for; afterDecode " +
          "takes the decoded pixels before anyone edits them, upright, for a colour profile or a " +
          "denoiser. Set decodeOptions on the element and they reach a drop and a paste too, which is " +
          "how the format nobody can read actually arrives",
        evidence: [unit("decode.test.ts"), browser("editor.spec.ts"), doc("docs/FRAMEWORKS.md")],
      },
      {
        capability: "EXIF orientation",
        layer: "Engine",
        detail:
          "All eight orientations upright at decode, so geometry never sees a rotated source — turned " +
          "by Pixen, or left alone where the browser has already turned it. Which of those a browser " +
          "is gets measured rather than assumed: Chromium turns the picture itself and does not stop " +
          "when asked for the pixels as stored, and turning it twice is a photograph on its side",
        evidence: [unit("exif.test.ts"), browser("editor.spec.ts"), doc("docs/BROWSER-SUPPORT.md")],
      },
      {
        capability: "Off-thread decode and encode",
        layer: "Engine",
        detail:
          "A worker built from a blob URL, used above 512 KB in and 1 MP out — thresholds that are now " +
          "named decisions with tests rather than numbers quoted in a sentence. A lossless encode is " +
          "never moved at any size, because reading the canvas back costs more than it saves. Falls " +
          "back in place",
        evidence: [unit("worker.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Preview proxy",
        layer: "Engine",
        detail:
          "Editing happens against a downscaled bitmap and exporting against the original, so a " +
          "48-megapixel source stays interactive without ever degrading the exported pixels",
        evidence: [unit("preview.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Decompression-bomb ceiling",
        layer: "Engine",
        detail:
          "MAX_CANVAS_PIXELS refuses a surface no browser would allocate, by area rather than by " +
          "either edge — before every canvas Pixen allocates, and after a decode, because only the " +
          "decoder knows the size a hostile file really described",
        evidence: [unit("canvas.test.ts"), doc("docs/SECURITY.md")],
      },
      {
        capability: "Host round trip",
        layer: "Engine",
        detail:
          "replaceSource swaps the pixels under an edit, keeping the crop, the annotations and the undo stack",
        evidence: [unit("lifecycle.test.ts"), story("RoundTrip"), browser("editor.spec.ts")],
      },
      {
        capability: "Lifecycle control",
        layer: "Engine",
        detail: "Cancel a load or an export in flight; close the picture without destroying the editor",
        evidence: [unit("lifecycle.test.ts"), unit("task-runner.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Task events",
        layer: "Engine",
        detail: list(TASK_EVENTS),
        evidence: [
          unit("editor-events.test.ts"),
          unit("observe.test.ts"),
          browser("editor.spec.ts"),
          doc("docs/FRAMEWORKS.md"),
        ],
      },
      {
        capability: "Honest progress",
        layer: "Engine",
        detail:
          "Counted where something is countable — fetched bytes, re-encode attempts, planned variants — and " +
          "reported as uncountable everywhere else rather than estimated",
        evidence: [unit("task-runner.test.ts"), story("Progress"), browser("editor.spec.ts")],
      },
      {
        capability: "Cancellation is not failure",
        layer: "Engine",
        detail: "A cancelled task reports an abort with its reason; only real failures reach the error channel",
        evidence: [unit("task-runner.test.ts"), unit("editor-events.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Edits as data",
        layer: "Engine",
        detail: "dispatchAll applies a list of intents as one undo step, so a host can open an image pre-edited",
        evidence: [unit("session.test.ts"), unit("editor.test.ts")],
      },
      {
        capability: "Host busy state",
        layer: "Element",
        detail:
          "A settable status message over the picture, a disabled state that blocks input without hiding it, " +
          "and a pill that shows a percentage only where one was measured",
        evidence: [
          unit("busy.test.ts"),
          unit("busy-label.test.ts"),
          story("RoundTrip"),
          story("Progress"),
          doc("docs/FRAMEWORKS.md"),
        ],
      },
      {
        capability: "Capability probe",
        layer: "Engine",
        detail: "What this browser actually supports, so a host can degrade deliberately",
        evidence: [unit("support.test.ts"), story("SupportReport"), doc("docs/BROWSER-SUPPORT.md")],
      },
    ],
  },
];
