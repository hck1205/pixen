/**
 * Module-size budget.
 *
 * Not a cap on lines — CLAUDE.md is deliberate that a file is split when it
 * starts answering two questions, not when it passes a number, and this
 * repository has files that are long and right: a facade of one-line delegating
 * methods, a table of capabilities, a stylesheet.
 *
 * This is a tripwire. Crossing the budget means one of two things has to
 * happen: split the file, or write down why it is exempt. What it buys is that
 * "this one is fine" stops being a private judgement and becomes a recorded
 * one, with a reason the next reader can disagree with.
 *
 * A file that is exempt still cannot grow: its allowance is what it measured
 * when the exemption was written, so the exemption ages badly on purpose.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Past this, a source file has to justify itself. */
export const BUDGET = 300;

/**
 * Files over budget, with the reason and the size the reason was written at.
 *
 * Raising a number here is a decision. If a file needs more room, either it is
 * genuinely one concern that grew — say so — or it is two concerns and the
 * budget just told you.
 */
export const EXEMPT = {
  // The custom element: lifecycle, observed attributes, properties, the
  // imperative API and the wiring between them. Three concerns have already
  // been extracted out of it — on-canvas text editing, sticker placement, and
  // every way an image arrives — and what is left is the element itself.
  "packages/web/src/element/pixen-image-editor.ts": 760,
  // The public imperative API: very nearly one line per method, each building
  // an intent and handing it to `dispatch`. Splitting it would scatter the
  // surface a host reads as one thing, and the decisions are already elsewhere.
  "packages/core/src/engine/editor.ts": 728,
  // Pointer plumbing over gesture functions that are pure and tested next
  // door. The class holds state, effects and subscribers, which is what the
  // working agreement says a class is for.
  "packages/web/src/viewport/viewport.ts": 488,
  // Every document mutation as a pure function, one per operation. The list is
  // long because the vocabulary is; each entry is a handful of lines.
  "packages/core/src/engine/commands.ts": 333,
};

const SOURCE = /^(packages|apps)\/[^/]+\/src\/.*\.tsx?$/;

export function scanModuleBudget(root = process.cwd(), budget = BUDGET) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((file) => SOURCE.test(file));

  const findings = [];
  for (const file of files) {
    let lines;
    try {
      lines = readFileSync(`${root}/${file}`, "utf8").split("\n").length;
    } catch {
      continue;
    }

    const allowance = EXEMPT[file];
    if (allowance === undefined) {
      if (lines > budget) findings.push({ file, lines, allowance: budget, exempt: false });
    } else if (lines > allowance) {
      findings.push({ file, lines, allowance, exempt: true });
    }
  }

  // An exemption for a file that is now comfortably inside the budget is a
  // note nobody needs, and it hides the next file that grows into its place.
  const stale = Object.entries(EXEMPT).filter(([file]) => {
    if (!files.includes(file)) return true;
    try {
      return readFileSync(`${root}/${file}`, "utf8").split("\n").length <= budget;
    } catch {
      return true;
    }
  });

  return { findings: findings.sort((a, b) => b.lines - a.lines), stale: stale.map(([file]) => file) };
}

export function formatBudget({ findings, stale }) {
  if (findings.length === 0 && stale.length === 0) return "module-budget scan: clean";

  const over = findings.map((finding) =>
    finding.exempt
      ? `${finding.file}: ${finding.lines} lines, past its ${finding.allowance}-line exemption`
      : `${finding.file}: ${finding.lines} lines, over the ${finding.allowance}-line budget`,
  );
  const unused = stale.map((file) => `${file}: exempt, but no longer over budget — drop the entry`);
  return [...over, ...unused].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = scanModuleBudget(process.cwd());
  console.log(formatBudget(result));
  if (result.findings.length > 0 || result.stale.length > 0) {
    console.log("\nSplit the file, or record why it is one concern in EXEMPT.");
    process.exit(1);
  }
}
