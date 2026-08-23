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
          "image orienter",
          "A helper that reads a photograph's stored orientation and applies it, used by both the read and " +
          "the write, and replaceable by the host",
        ),
        evidence: [unit("exif.test.ts"), unit("decode.test.ts"), browser("editor.spec.ts")],
        note:
          "The requirement is met by measuring rather than by a flag: every rotated photograph loaded " +
          "sideways in Chromium until the probe was added, because both layers were turning it",
      },
      {
        capability: "A signed request",
        pixen:
          "Custom headers on the fetch, and a credentials mode — so a source behind a host's own auth is " +
          "read the way that host reads anything else",
        verdict: "met",
        market: required("image reader", "Custom request headers and a credentials setting on the read"),
        evidence: [unit("decode.test.ts"), doc("docs/ARCHITECTURE.md")],
      },
      {
        capability: "A file the browser cannot read",
        pixen:
          "`beforeDecode` receives the bytes before anything tries to decode them, so a host converts HEIC, " +
          "TIFF or its own format into something the browser knows and the rest of the pipeline is unchanged",
        verdict: "met",
        market: required(
          "image reader",
          "A step before the decode where the host converts a file the browser cannot open into one it can",
        ),
        evidence: [unit("decode.test.ts"), doc("docs/ARCHITECTURE.md")],
      },
      {
        capability: "The decoded picture, before the editor sees it",
        pixen:
          "`afterDecode` receives the upright bitmap and returns the one to edit — a background removed, a " +
          "colour profile applied, a model run over it",
        verdict: "beyond",
        evidence: [unit("decode.test.ts"), doc("docs/ARCHITECTURE.md")],
      },
      {
        capability: "Formats it can read",
        pixen:
          "Whatever the browser decodes, which in every current one is JPEG, PNG, GIF, WebP, BMP, SVG and " +
          "AVIF — Pixen parses none of them itself, so the list is the platform's rather than ours",
        verdict: "met",
        market: required("image reader", "The image formats the browser supports, with a hook for the rest"),
        evidence: [unit("decode.test.ts"), story("Sources"), doc("docs/BROWSER-SUPPORT.md")],
      },
      {
        capability: "Replacing the pixels under an edit",
        pixen:
          "`replaceSource` swaps the source and keeps the crop, the annotations and the whole undo history " +
          "— which is what a round trip through a background remover or an upscaler needs",
        verdict: "met",
        market: required(
          "image manipulation",
          "The source image can be replaced while the edit history is kept, for a round trip through a " +
          "third-party service",
        ),
        evidence: [unit("editor.test.ts"), story("RoundTrip"), browser("editor.spec.ts")],
      },
      {
        capability: "The preview as its own stage",
        pixen:
          "`replacePreview` puts the host's own picture on screen and leaves the source alone, and " +
          "`pixen-preview` announces it — so an export made before the slow half of a round trip returns " +
          "is still the picture that was loaded",
        verdict: "met",
        market: required(
          "image events",
          "A preview that loads as a stage of its own, announced separately, and replaceable without " +
          "touching the full-resolution source",
        ),
        evidence: [unit("preview.test.ts"), browser("editor.spec.ts"), doc("docs/ARCHITECTURE.md")],
        note:
          "The difference between this and `replaceSource` is the whole point: one changes what is on " +
          "screen, the other changes what comes out. Pixen's own proxy is drawn synchronously on the " +
          "first frame, so it has no separate moment to announce — the event is for the swap, which does",
      },
      {
        capability: "A memory ceiling on the way in",
        pixen:
          "`maxPixels` scales an oversized picture down to fit rather than refusing it, and the hard " +
          "canvas limit refuses with a named error rather than a dead tab",
        verdict: "beyond",
        evidence: [unit("canvas.test.ts"), unit("decode.test.ts"), doc("docs/SECURITY.md")],
        note:
          "The supplied material puts its ceiling on the *writer*, which is a different question: how big " +
          "a canvas may be drawn, rather than how big a file may be opened. That one is on the output " +
          "page. This one is ours, and it is what a decompression bomb meets first",
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
