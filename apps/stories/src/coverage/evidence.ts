/**
 * What a coverage claim is, and what counts as proof of one.
 *
 * The vocabulary the table is written in, kept apart from the table itself so
 * each slice of it imports one small thing rather than the whole page.
 */
export type CoverageLayer = "Engine" | "Element" | "Bindings";

export type Evidence =
  | { kind: "unit"; file: string }
  | { kind: "browser"; file: string }
  | { kind: "visual"; file: string }
  | { kind: "story"; name: string }
  | { kind: "doc"; file: string };

export interface CoverageEntry {
  capability: string;
  layer: CoverageLayer;
  /** What it is today. Derived from the code wherever the code has a list. */
  detail: string;
  /** What proves it. Empty is not allowed; a claim with no evidence is a claim. */
  evidence: Evidence[];
}

export interface CoverageGroup {
  title: string;
  /** Why this group exists, in one line. */
  summary: string;
  entries: CoverageEntry[];
}

export const unit = (file: string): Evidence => ({ kind: "unit", file });
export const browser = (file: string): Evidence => ({ kind: "browser", file });
export const visual = (file: string): Evidence => ({ kind: "visual", file });
export const story = (name: string): Evidence => ({ kind: "story", name });
export const doc = (file: string): Evidence => ({ kind: "doc", file });

/** How a piece of evidence reads in the table. */
export function evidenceLabel(evidence: Evidence): string {
  switch (evidence.kind) {
    case "unit":
      return `unit · ${evidence.file}`;
    case "browser":
      return `browser · ${evidence.file}`;
    case "visual":
      return `visual · ${evidence.file}`;
    case "story":
      return `story · ${evidence.name}`;
    case "doc":
      return evidence.file;
  }
}

export const list = (values: readonly string[]): string => values.join(", ");
