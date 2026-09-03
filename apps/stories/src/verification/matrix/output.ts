/**
 * What comes out: the file, its size, its bytes and its name.
 *
 * One slice of the verification matrix. See `verification/claim.ts` for what a
 * verdict is allowed to mean.
 */
import { browser, doc, list, required, story, unit, type ClaimGroup } from "../claim.js";
import { METADATA_POLICIES, SCHEMA_VERSION } from "@pixen/core";
import { formatLabel, OUTPUT_FORMATS } from "@pixen/web";

const FORMATS = list(OUTPUT_FORMATS.map((format) => (format === null ? "match source" : formatLabel(format))));

export const OUTPUT_CLAIMS: ClaimGroup[] = [
  {
    title: "Output",
    summary: "The file the editor produces, and everything a host can say about what it should be.",
    claims: [
      {
        capability: "Formats it can write",
        pixen: FORMATS,
        verdict: "met",
        market: required("image writer", "The output format is chosen by the host, or follows the source"),
        evidence: [unit("processing.test.ts"), story("Output"), browser("editor.spec.ts")],
      },
      {
        capability: "Raw pixels out",
        pixen:
          "Three shapes: a file from `export`, a canvas from `renderToCanvas`, and an `ImageData` from " +
          "`renderToImageData` — for a model's input, a WASM filter, or a pixel comparison",
        verdict: "met",
        market: required(
          "image writer",
          "The output is a file, a canvas, or raw pixel data, chosen by the host on the same call",
        ),
        evidence: [unit("mask.test.ts"), doc("docs/ARCHITECTURE.md")],
        note:
          "Three functions rather than one call with three modes, because the results are different shapes " +
          "and a union of them would make every caller narrow it. The pixels one releases the surface " +
          "itself: `getImageData` copies, so keeping the canvas would keep a second copy of the picture",
      },
      {
        capability: "A byte budget",
        pixen:
          "`maxBytes` searches the quality down until the file fits, reports every attempt, and stops at " +
          "the quality floor — returning a file that is over budget rather than one that is unusable",
        verdict: "beyond",
        evidence: [unit("processing.test.ts"), story("Output"), browser("editor.spec.ts")],
        note: "The floor behaviour is the interesting half, and it is what the unit test pins",
      },
      {
        capability: "Several sizes at once",
        pixen:
          "A plan of variants resolved before anything is rendered, encoded largest first, with a `srcset` " +
          "string and filenames that follow the labels",
        verdict: "beyond",
        evidence: [unit("variants.test.ts"), story("Variants"), browser("editor.spec.ts")],
        note:
          "Two specs that would produce the same file collapse into one — same pixels, same format and " +
          "same quality; a different quality is a different file and is kept",
      },
      {
        capability: "A memory ceiling on the way out",
        pixen:
          "One limit for every platform, scaled to what the device can actually allocate, rather than a " +
          "smaller constant applied to one operating system",
        verdict: "met",
        market: required("image writer", "A canvas memory limit respected while drawing the output"),
        evidence: [unit("canvas.test.ts"), doc("docs/SECURITY.md")],
      },
      {
        capability: "Metadata",
        pixen: `${list(METADATA_POLICIES)} — strip everything, or carry the source's own EXIF into a JPEG output`,
        verdict: "met",
        market: required(
          "image writer",
          "The head of the source file is copied into the output, so its own record of itself survives the edit",
        ),
        evidence: [unit("metadata.test.ts"), unit("exif.test.ts"), doc("docs/SECURITY.md")],
        note:
          "JPEG to JPEG only, and the copy is rewritten upright with the thumbnail and the GPS block " +
          "erased — a stripped orientation tag would turn the picture back on its side",
      },
      {
        capability: "Filenames",
        pixen: "Derived from the source name and the chosen format, and replaceable by a hook",
        verdict: "met",
        market: required("image writer", "The host decides what the produced file is called, from the input file"),
        evidence: [unit("processing.test.ts"), story("Pipeline")],
      },
      {
        capability: "Delivery",
        pixen:
          "A URL to post to, the multipart fields under the host's control, custom headers, a credentials " +
          "mode, real request-body progress, and the status and body handed back",
        verdict: "met",
        market: required(
          "image writer",
          "The output is stored by posting it to a URL, with the form fields configurable, or handed to a " +
          "function the host supplies",
        ),
        evidence: [unit("upload.test.ts"), story("Progress"), browser("editor.spec.ts")],
        note:
          "The third shape — hand the result to a function — is what `export` already is: it returns the " +
          "blob, and a host that wants to store it its own way simply does. Progress is through XHR " +
          "because it is still the only API that reports how much of a request body has gone",
      },
      {
        capability: "Default quality",
        pixen: "Per format, and only when neither the host nor the document has said — see `resolveQuality`",
        verdict: "met",
        market: required(
          "image writer",
          "A default quality chosen per format — a higher one for JPEG than for WebP, because the same " +
          "number does not mean the same thing to two encoders",
        ),
        evidence: [unit("processing.test.ts"), doc("docs/ARCHITECTURE.md")],
        note:
          "Measured rather than adopted: three pictures encoded across the range in Chromium and compared " +
          "to the source pixel by pixel. On the two where the error was visible at all, matching JPEG's " +
          "error put WebP about 0.05 to 0.10 lower; on a nearly flat one the order reversed and both were " +
          "invisible. The numbers and the method are in `docs/PROVENANCE.md`",
      },
      {
        capability: "The shape of the result",
        pixen: "One result object with the blob, the size, the format, the quality used, the bytes and the filename",
        verdict: "declined",
        market: required(
          "image writer",
          "Which properties the result carries is the host's to choose, so a large one can be trimmed",
        ),
        evidence: [unit("processing.test.ts")],
        note:
          "Nothing to trim. The option exists in the supplied material because its result carries the " +
          "source file, the whole edit state and an upload object; ours carries a blob and six numbers, so " +
          "the option would be an option to remove six numbers. Adding an API that does nothing useful is " +
          "worse than not having it — and if a result ever grows something worth dropping, this row is " +
          "where that argument gets reopened",
      },
      {
        capability: "Headless processing",
        pixen:
          "`processImage` and `processImages` resize and re-encode with no editor at all; for edits " +
          "without an interface, an `Editor` is created, loaded, given its intents and exported — no DOM " +
          "element anywhere in that",
        verdict: "met",
        market: required(
          "image manipulation",
          "A file processed with a given set of edits and no editor interface loaded",
        ),
        evidence: [unit("processing.test.ts"), story("Policies"), browser("editor.spec.ts")],
        note:
          "In two shapes rather than one call: the batch path takes no edits, and the edits path goes " +
          "through the engine. The single call that does both is an ergonomic Pixen has not written",
      },
      {
        capability: "The document as JSON",
        pixen:
          `Schema v${SCHEMA_VERSION}, serialised, restored, and migrated step by step from every earlier ` +
          "version — with the bitmaps kept out of it and referenced by id",
        verdict: "met",
        market: required(
          "image methods",
          "A saved state may be handed in when loading an image, so a picture opens on the edit it was left with",
        ),
        evidence: [unit("document.test.ts"), story("SaveAndResume"), doc("docs/DOCUMENT-SCHEMA.md")],
        note:
          "`restore` takes the state and the bytes together, because a document references its bitmap by " +
          "id and a saved edit without its picture is not openable",
      },
      {
        capability: "The edit that made the file, returned with it",
        pixen: "The result is the file and what it cost: the blob, its size, format, quality, bytes and filename",
        verdict: "open",
        market: required("image methods", "Processing resolves with the saved state alongside the written file"),
        evidence: [unit("processing.test.ts")],
        note:
          "A host that wants both calls `toJSON()` after the export, and those are two reads of a " +
          "document that anyone may have edited in between — so the state it saves can describe an edit " +
          "the file it saved does not have. Returning the state the export actually drew from makes the " +
          "pair consistent by construction, which is the argument for this rather than convenience",
      },
    ],
  },
];
