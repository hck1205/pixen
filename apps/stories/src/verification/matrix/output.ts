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
          "`renderDocumentToCanvas` hands back a canvas — a host reads ImageData, uploads it to WebGL, or " +
          "encodes it itself — but there is no `imageData` output format on the export call",
        verdict: "open",
        market: required(
          "image writer",
          "The output is a file, a canvas, or raw pixel data, chosen by the host on the same call",
        ),
        evidence: [unit("mask.test.ts"), doc("docs/ARCHITECTURE.md")],
        note:
          "Two of the three: a file from `export`, a canvas from `renderDocumentToCanvas`. Raw pixel data " +
          "is one `getImageData` away from the canvas, which is not the same as being offered",
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
        pixen: "One number, 0.85, whatever the format",
        verdict: "open",
        market: required(
          "image writer",
          "A default quality chosen per format — a higher one for JPEG than for WebP, because the same " +
          "number does not mean the same thing to two encoders",
        ),
        evidence: [unit("processing.test.ts"), doc("docs/ARCHITECTURE.md")],
        note:
          "A real difference in the bytes a host gets without asking: ours is stingier than the supplied " +
          "default for JPEG and more generous for WebP. Changing it changes every export, so it is a " +
          "decision rather than a line",
      },
      {
        capability: "The shape of the result",
        pixen: "One result object with the blob, the size, the format, the quality used, the bytes and the filename",
        verdict: "open",
        market: required(
          "image writer",
          "Which properties the result carries is the host's to choose, so a large one can be trimmed",
        ),
        evidence: [unit("processing.test.ts")],
        note:
          "Nothing to trim: ours holds no copy of the source, no copy of the state and no upload object, " +
          "so the option would be an option to remove six numbers",
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
        verdict: "unmeasured",
        evidence: [unit("document.test.ts"), story("SaveAndResume"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
    ],
  },
];
