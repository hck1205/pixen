import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COVERAGE, coverageCount, evidenceLabel } from "../../apps/stories/src/coverage.js";

/**
 * The coverage page claims things. This checks the claims can be followed.
 *
 * A feature table is worth exactly as much as its worst entry: one row naming a
 * test that was renamed away, or a story that was deleted, and the whole page
 * becomes something nobody trusts. So every file and every story named there
 * has to exist, and every capability has to name something.
 */
const ROOT = new URL("../../", import.meta.url).pathname;

/** Where a unit test may live: any package's suite, or the root suite. */
function unitTestFiles(): Set<string> {
  const files = new Set(readdirSync(`${ROOT}tests/unit`));
  for (const pkg of readdirSync(`${ROOT}packages`)) {
    const directory = `${ROOT}packages/${pkg}/test`;
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) files.add(file);
  }
  return files;
}

/** Every story the browser can actually show, by its exported name. */
function storyNames(): Set<string> {
  const directory = `${ROOT}apps/stories/src`;
  const names = new Set<string>();
  for (const file of readdirSync(directory)) {
    if (!file.endsWith(".stories.tsx")) continue;
    const source = readFileSync(`${directory}/${file}`, "utf8");
    for (const match of source.matchAll(/^export const (\w+): Story/gm)) names.add(match[1]!);
  }
  return names;
}

const units = unitTestFiles();
const stories = storyNames();
const browserTests = new Set(readdirSync(`${ROOT}tests/browser`));
const entries = COVERAGE.flatMap((group) => group.entries);

describe("the coverage page", () => {
  it("lists something", () => {
    expect(coverageCount()).toBeGreaterThan(40);
    expect(COVERAGE.length).toBeGreaterThan(5);
  });

  it("names every capability once", () => {
    const names = entries.map((entry) => `${entry.capability}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it("backs every capability with at least one piece of evidence", () => {
    const bare = entries.filter((entry) => entry.evidence.length === 0);
    expect(bare.map((entry) => entry.capability)).toEqual([]);
  });

  it("says what each capability actually is", () => {
    const empty = entries.filter((entry) => entry.detail.trim() === "");
    expect(empty.map((entry) => entry.capability)).toEqual([]);
  });

  it("names unit tests that exist", () => {
    const missing = entries.flatMap((entry) =>
      entry.evidence
        .filter((evidence) => evidence.kind === "unit" && !units.has(evidence.file))
        .map((evidence) => `${entry.capability}: ${evidenceLabel(evidence)}`),
    );
    expect(missing).toEqual([]);
  });

  it("names browser and visual specs that exist", () => {
    const missing = entries.flatMap((entry) =>
      entry.evidence
        .filter(
          (evidence) =>
            (evidence.kind === "browser" || evidence.kind === "visual") && !browserTests.has(evidence.file),
        )
        .map((evidence) => `${entry.capability}: ${evidenceLabel(evidence)}`),
    );
    expect(missing).toEqual([]);
  });

  it("names stories that exist", () => {
    const missing = entries.flatMap((entry) =>
      entry.evidence
        .filter((evidence) => evidence.kind === "story" && !stories.has(evidence.name))
        .map((evidence) => `${entry.capability}: ${evidenceLabel(evidence)}`),
    );
    expect(missing).toEqual([]);
  });

  it("names documents that exist", () => {
    const missing = entries.flatMap((entry) =>
      entry.evidence
        .filter((evidence) => evidence.kind === "doc" && !existsSync(`${ROOT}${evidence.file}`))
        .map((evidence) => `${entry.capability}: ${evidenceLabel(evidence)}`),
    );
    expect(missing).toEqual([]);
  });
});
