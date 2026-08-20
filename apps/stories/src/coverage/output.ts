/**
 * The file the editor produces, and the document that outlives the session.
 *
 * One slice of the coverage table. See `index.ts` for what the table is and the
 * rules it is kept honest by.
 */
import { browser, doc, list, story, unit, visual, type CoverageGroup } from "./evidence.js";
import { PRESETS, SCHEMA_VERSION } from "@pixen/core";
import { OUTPUT_FORMATS, formatLabel } from "@pixen/web";

export const OUTPUT_COVERAGE: CoverageGroup[] = [
  {
    title: "Output",
    summary: "What leaves the editor: how big, in what format, and how many files.",
    entries: [
      {
        capability: "Formats",
        layer: "Element",
        detail: list(OUTPUT_FORMATS.map((format) => (format === null ? "auto" : formatLabel(format)))),
        evidence: [unit("output-settings.test.ts"), story("Output")],
      },
      {
        capability: "Resize",
        layer: "Element",
        detail: "Explicit width and height with the ratio linked or free; never upscales past the source",
        evidence: [unit("output-settings.test.ts"), unit("processing.test.ts"), story("Output")],
      },
      {
        capability: "Quality and byte budget",
        layer: "Engine",
        detail: "Quality for the lossy formats, and a maxBytes search that re-encodes until it fits",
        evidence: [unit("processing.test.ts"), story("ExportFlow"), browser("editor.spec.ts")],
      },
      {
        capability: "Multiple sizes",
        layer: "Engine",
        detail: "exportVariants plans the sizes first, drops duplicates, and writes a srcset",
        evidence: [unit("variants.test.ts"), story("Variants")],
      },
      {
        capability: "Downscaling quality",
        layer: "Engine",
        detail: "Halving passes before the final draw, so fine detail averages instead of aliasing",
        evidence: [unit("processing.test.ts")],
      },
      {
        capability: "Editor-free processing",
        layer: "Engine",
        detail: "processImage and processImages, with bounded concurrency and per-item failures",
        evidence: [unit("processing.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Policies",
        layer: "Engine",
        detail: list(Object.keys(PRESETS)),
        evidence: [unit("processing.test.ts"), story("Policies")],
      },
      {
        capability: "Transparency",
        layer: "Engine",
        detail: "Alpha kept where the format has it, and a background painted where it does not",
        evidence: [unit("processing.test.ts"), story("Transparency")],
      },
    ],
  },
  {
    title: "The document",
    summary: "What is stored, and what happens to it when the schema moves.",
    entries: [
      {
        capability: "JSON document",
        layer: "Engine",
        detail: `Schema v${SCHEMA_VERSION}; bitmaps live in the ResourceManager and are referenced by id`,
        evidence: [unit("document.test.ts"), doc("docs/DOCUMENT-SCHEMA.md")],
      },
      {
        capability: "Validation",
        layer: "Engine",
        detail: "A parse that rejects a malformed document rather than half-loading it",
        evidence: [unit("validate.test.ts")],
      },
      {
        capability: "Migrations",
        layer: "Engine",
        detail: "One registered migration per version step, so an old save opens rather than failing",
        evidence: [unit("document.test.ts"), unit("decoration.test.ts")],
      },
      {
        capability: "History",
        layer: "Engine",
        detail: "Undo and redo with transactions, so one gesture is one step whatever it changed",
        evidence: [unit("history.test.ts"), unit("session.test.ts"), browser("editor.spec.ts")],
      },
      {
        capability: "Save and resume",
        layer: "Engine",
        detail: "toJSON and restore round-trip a session, including host metadata Pixen never reads",
        evidence: [unit("document.test.ts"), story("SaveAndResume")],
      },
    ],
  },
];
