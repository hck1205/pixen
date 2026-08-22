/**
 * Getting a picture in, and what the editor says while it arrives.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, list, required, story, unit, type ClaimGroup } from "../claim.js";
import { PIXEN_EVENTS } from "@pixen/web";

/** Read from the binding list rather than retyped, so the page cannot drift. */
const EVENTS = list(PIXEN_EVENTS);

export const INTAKE_CLAIMS: ClaimGroup[] = [
  {
    title: "Intake",
    summary: "Every way a picture reaches the editor, and everything decided before a pixel is drawn.",
    claims: [
      {
        capability: "Source kinds",
        pixen:
          "Blob and File, ArrayBuffer and typed arrays, an ImageBitmap, an <img>, a canvas, and a string " +
          "URL — remote, object or data. One `load` call for all of them",
        verdict: "unmeasured",
        evidence: [unit("decode.test.ts"), story("Sources"), browser("editor.spec.ts")],
      },
      {
        capability: "Drag, drop and paste",
        pixen: "A drop anywhere on the element, and a paste from the clipboard, both opening the image",
        verdict: "unmeasured",
        evidence: [browser("editor.spec.ts"), story("EmptyState")],
      },
      {
        capability: "Orientation",
        pixen:
          "EXIF orientation is read from the JPEG itself and applied — but only after measuring whether " +
          "the decoder already applied it, which Chromium does and a bare ImageBitmap decode does not",
        verdict: "met",
        market: required(
          "export pipeline",
          "A default orienter that puts a photograph upright before anything else sees it, replaceable by the host",
        ),
        evidence: [unit("exif.test.ts"), unit("decode.test.ts"), browser("editor.spec.ts")],
        note:
          "The requirement is met by measuring rather than by a flag: every rotated photograph loaded " +
          "sideways in Chromium until the probe was added, because both layers were turning it",
      },
      {
        capability: "A replaceable reader",
        pixen:
          "`headers` and `afterDecode` hooks: a host can sign a request for its own storage, and can see " +
          "the decoded bitmap before the editor does",
        verdict: "met",
        market: required(
          "export pipeline",
          "The read step is the host's to replace, so an image can come from somewhere the SDK has never heard of",
        ),
        evidence: [unit("decode.test.ts"), doc("docs/ARCHITECTURE.md")],
      },
      {
        capability: "A memory ceiling",
        pixen:
          "`maxPixels` scales an oversized picture down to fit rather than refusing it, and the hard " +
          "canvas limit refuses with a named error rather than a dead tab",
        verdict: "met",
        market: required("export pipeline", "A pixel ceiling above which an image is not decoded as-is"),
        evidence: [unit("canvas.test.ts"), unit("decode.test.ts"), doc("docs/SECURITY.md")],
      },
      {
        capability: "Progress and cancellation",
        pixen:
          `Byte-accurate download progress from Content-Length, an AbortSignal on every long call, and ${EVENTS} ` +
          "as DOM events",
        verdict: "unmeasured",
        evidence: [unit("task-runner.test.ts"), story("Progress"), browser("editor.spec.ts")],
      },
      {
        capability: "Decoding off the main thread",
        pixen:
          "A worker decodes above 512 KB in and encodes above 1 MP out; below those it is not worth the " +
          "transfer, and where there is no worker the same code runs on the main thread",
        verdict: "unmeasured",
        evidence: [unit("worker.test.ts"), story("SupportReport"), doc("docs/BROWSER-SUPPORT.md")],
      },
    ],
  },
];
