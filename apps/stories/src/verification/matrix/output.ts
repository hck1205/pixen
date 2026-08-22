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
        capability: "Formats",
        pixen: FORMATS,
        verdict: "met",
        market: required("export pipeline", "The output format is chosen by the host, or follows the source"),
        evidence: [unit("processing.test.ts"), story("Output"), browser("editor.spec.ts")],
      },
      {
        capability: "Raw pixels out",
        pixen:
          "`renderDocumentToCanvas` hands back a canvas — a host reads ImageData, uploads it to WebGL, or " +
          "encodes it itself — but there is no `imageData` output format on the export call",
        verdict: "open",
        market: required("export pipeline", "An output option that returns raw pixel data rather than an encoded file"),
        evidence: [unit("mask.test.ts"), doc("docs/ARCHITECTURE.md")],
        note: "The capability is there under a different name; the option on the documented call is not",
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
        capability: "Metadata",
        pixen: `${list(METADATA_POLICIES)} — strip everything, or carry the source's own EXIF into a JPEG output`,
        verdict: "met",
        market: required(
          "export pipeline",
          "The source's metadata can be carried into the output rather than always discarded",
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
        market: required("export pipeline", "The host decides what the produced file is called"),
        evidence: [unit("processing.test.ts"), story("Pipeline")],
      },
      {
        capability: "Delivery",
        pixen:
          "Multipart upload with real request-body progress, through XHR because it is the only API that " +
          "reports it, plus the response body and status handed back",
        verdict: "beyond",
        evidence: [unit("upload.test.ts"), story("Progress"), browser("editor.spec.ts")],
      },
      {
        capability: "Headless processing",
        pixen: "`processImages` runs the whole pipeline with no editor and no DOM element at all",
        verdict: "unmeasured",
        evidence: [unit("processing.test.ts"), story("Policies"), browser("editor.spec.ts")],
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
