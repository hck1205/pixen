import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS helper, deliberately dependency-free
import { compare, parseRecord, renderRecord, report, scanPublicSurface } from "../../scripts/public-surface.mjs";

const root = new URL("../..", import.meta.url).pathname;

/**
 * A `@pixen/*` export is a contract, and most of them were never decided: a
 * barrel that says `export *` publishes whatever the folder holds, so adding a
 * file to it added to the public API and nobody had to agree.
 */
describe("public surface", () => {
  const surface = scanPublicSurface(root);
  const recorded = parseRecord(readFileSync(`${root}/docs/PUBLIC-API.md`, "utf8"));

  it("matches what docs/PUBLIC-API.md records", () => {
    expect(report(compare(surface, recorded))).toBe("public-surface scan: clean");
  });

  it("covers every package that publishes", () => {
    expect([...surface.keys()]).toEqual(["core", "web", "react", "vue", "svelte", "video"]);
    for (const [name, names] of surface) expect(names.length, name).toBeGreaterThan(0);
  });

  it("follows a re-export to the module that declares the name", () => {
    // `createDocument` is written in model/document.ts and reaches the entry
    // through two barrels; a scan that only read index.ts would miss it.
    expect(surface.get("core")).toContain("createDocument");
    expect(surface.get("web")).toContain("PixenImageEditorElement");
  });

  it("reports an added name and a removed one, each as itself", () => {
    const before = new Map([["core", ["a", "b"]]]);
    const after = new Map([["core", ["b", "c"]]]);
    expect(compare(after, before)).toEqual([{ package: "core", added: ["c"], removed: ["a"] }]);
    expect(report(compare(after, before))).toContain("+ c");
    expect(report(compare(after, before))).toContain("- a");
  });

  it("writes a record it can read back", () => {
    const round = parseRecord(renderRecord(surface));
    expect([...round.keys()]).toEqual([...surface.keys()]);
    for (const [name, names] of surface) expect(round.get(name), name).toEqual(names);
  });
});
