import { PixenError } from "../errors/index.js";
import { cloneDocument } from "./document.js";
import { migrateDocument } from "./migrations.js";
import type { EditorDocument } from "./types.js";
import { parseDocument } from "./validate.js";

/** Plain JSON snapshot suitable for `JSON.stringify`, a database column, or postMessage. */
export function serializeDocument(document: EditorDocument): EditorDocument {
  return cloneDocument(document);
}

export function documentToJSON(document: EditorDocument, space?: number): string {
  return JSON.stringify(serializeDocument(document), null, space);
}

/** Migrates then validates. Accepts an object or a JSON string. */
export function deserializeDocument(input: unknown): EditorDocument {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (cause) {
      throw new PixenError("INVALID_DOCUMENT", "Document JSON could not be parsed", { cause });
    }
  }
  return parseDocument(migrateDocument(raw));
}
