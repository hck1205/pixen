import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS helper, deliberately dependency-free
import { ACCEPTED_MISSING, formatFindings, scanDocPaths } from "../../scripts/doc-paths.mjs";

const root = new URL("../..", import.meta.url).pathname;

/**
 * The documentation names files, and files here become folders.
 *
 * Four of `PROVENANCE.md`'s paths were stale when this was written — the record
 * of what each module was derived from, pointing at modules that had grown into
 * folders. Prose does not compile, so nothing said anything.
 */
describe("paths the documentation names", () => {
  it("all exist", () => {
    expect(formatFindings(scanDocPaths(root))).toBe("documented-path scan: clean");
  });

  it("notices a file that became a folder", () => {
    const findings = scanDocPaths(root, {
      tracked: ["packages/core/src/engine/commands/frame.ts", "docs/EXAMPLE.md"],
      read: () => "The commands live in `engine/commands.ts`, one per file.",
    });
    expect(findings).toEqual([{ document: "docs/EXAMPLE.md", line: 1, path: "engine/commands.ts" }]);
  });

  it("reads a path the way the documentation writes one", () => {
    // `render/scene.ts` in prose, `packages/core/src/render/scene.ts` on disk.
    const findings = scanDocPaths(root, {
      tracked: ["packages/core/src/render/scene.ts", "docs/EXAMPLE.md"],
      read: () => "See `render/scene.ts` and `packages/core/src/render/scene.ts`, and `render/`.",
    });
    expect(findings).toEqual([]);
  });

  it("leaves alone what is not a path at all", () => {
    const findings = scanDocPaths(root, {
      tracked: ["docs/EXAMPLE.md"],
      read: () => "Call `editor.dispatch(intent)`, which returns a `Result`, in `@pixen/core`.",
    });
    expect(findings).toEqual([]);
  });

  it("keeps the allowlist short enough to read", () => {
    expect(ACCEPTED_MISSING.size).toBeLessThanOrEqual(5);
  });
});
