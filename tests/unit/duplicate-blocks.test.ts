import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS helper, deliberately dependency-free
import {
  ACCEPTED_DUPLICATION,
  formatDuplicates,
  MAX_OCCURRENCES,
  scanDuplicateBlocks,
} from "../../scripts/duplicate-blocks.mjs";

const root = new URL("../..", import.meta.url).pathname;

/**
 * "Commonise the third occurrence" used to be enforced by reading, which found
 * plenty and also let a duplicate survive a whole refactor pass. This makes the
 * third copy a failing test.
 */
describe("duplicate blocks", () => {
  it("finds none outside the accepted repetition", () => {
    expect(formatDuplicates(scanDuplicateBlocks(root))).toBe("duplicate-block scan: clean");
  });

  it("allows two copies, because abstracting the first similarity is its own mistake", () => {
    expect(MAX_OCCURRENCES).toBe(2);
  });

  it("keeps the accepted list short enough that every entry is read", () => {
    expect(ACCEPTED_DUPLICATION.length).toBeLessThanOrEqual(4);
  });

  it("reports one finding per clone, however many windows it spans", () => {
    // A twelve-line clone is nine overlapping four-line windows. Reporting all
    // nine would say the same thing nine times and bury the next finding.
    const block = Array.from({ length: 12 }, (_, index) => `  const step${index} = value + ${index};`).join("\n");
    const source = `export function planted(value: number): number {\n${block}\n  return step11;\n}\n`;
    const findings = scanDuplicateBlocks(root, {
      files: ["a.ts", "b.ts", "c.ts"].map((name) => ({ file: name, source })),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].places).toHaveLength(3);
    expect(findings[0].length).toBeGreaterThan(10);
  });

  it("does not call three identical import lists a clone", () => {
    // Three packages binding to the same engine name the same types. There is
    // no module an import statement can be factored into, so calling it a
    // duplicate would only teach a reader to ignore the scan.
    const source = [
      "import type {",
      "  AbortReason,",
      "  Editor,",
      "  ProgressReport,",
      '} from "@pixen/core";',
      "export const value = 1;",
    ].join("\n");
    expect(
      scanDuplicateBlocks(root, {
        files: ["a.ts", "b.ts", "c.ts"].map((name) => ({ file: name, source })),
      }),
    ).toEqual([]);
  });

  it("still sees a clone that sits under an import list", () => {
    const source = [
      'import { thing } from "./thing.js";',
      "export function planted(value: number): number {",
      "  const a = value + 1;",
      "  const b = a * 2;",
      "  const c = b - thing;",
      "  return c;",
      "}",
    ].join("\n");
    expect(
      scanDuplicateBlocks(root, {
        files: ["a.ts", "b.ts", "c.ts"].map((name) => ({ file: name, source })),
      }),
    ).toHaveLength(1);
  });

  it("does not report two copies", () => {
    const source = "export const a = 1;\nexport const b = 2;\nexport const c = 3;\nexport const d = 4;\n";
    expect(
      scanDuplicateBlocks(root, { files: [{ file: "a.ts", source }, { file: "b.ts", source }] }),
    ).toEqual([]);
  });
});
