/**
 * Documented-path scan.
 *
 * The documentation here points at files by name constantly — `ARCHITECTURE.md`
 * is a tour of them, and `PROVENANCE.md` is a file-by-file record of what each
 * one was derived from. A path that no longer exists sends a reader nowhere,
 * and in `PROVENANCE.md` it does worse than that: the whole value of that
 * document is being able to open the file it names and check the claim.
 *
 * Four of its seven paths had gone stale by the time this was written, all the
 * same way — a file grew into a folder of the same name, which is a move this
 * project makes deliberately and often. Nothing failed, because prose does not
 * compile.
 *
 * Markdown only, and measured rather than assumed: source comments hold 105
 * path references, of which four were not in the tree — two live pointers that
 * had rotted, and two notes saying what a file used to be, which is history and
 * not a pointer at all. Half the findings being correct as they stand is a poor
 * check, and failing on the history would teach people to stop writing it. So
 * the scan reads documentation, where a path is always a pointer, and source
 * comments are read by people.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Paths named on purpose that do not exist, each with its reason.
 *
 * Keep this short. Every entry is a reader sent somewhere they cannot go.
 */
export const ACCEPTED_MISSING = new Map([
  ["helpers.ts", "CLAUDE.md names it as what not to call a module"],
  ["utils.ts", "the same, beside it"],
  ["test-results/", "Playwright writes it on a failing run; it is git-ignored"],
]);

/** A backticked token worth resolving: a file with a known extension, or a folder. */
const PATH_LIKE = /^(?:[\w.@-]+\/)*[\w.@-]+\.(?:ts|tsx|mjs|js|json|md)$|^(?:[\w.@-]+\/)+$/;
const BACKTICKED = /`([^`\n]+)`/g;
const DOCUMENT = /\.md$/;

/**
 * How a path reads in prose here: `render/scene.ts`, not
 * `packages/core/src/render/scene.ts`. Both resolve, so both are checked the
 * same way — against the tracked tree with the package plumbing folded away.
 */
function addressesOf(tracked) {
  const files = new Set();
  const folders = new Set();
  for (const file of tracked) {
    for (const form of new Set([file, file.replace(/^(packages|apps)\//, "").replace("/src/", "/")])) {
      files.add(form);
      const parts = form.split("/");
      for (let i = 1; i < parts.length; i += 1) folders.add(`${parts.slice(0, i).join("/")}/`);
    }
  }
  return { files, folders };
}

function resolves(token, { files, folders }) {
  if (token.endsWith("/")) {
    return folders.has(token) || [...folders].some((folder) => folder.endsWith(`/${token}`));
  }
  return files.has(token) || [...files].some((file) => file.endsWith(`/${token}`));
}

export function scanDocPaths(root = process.cwd(), options = {}) {
  const tracked =
    options.tracked ??
    execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const accepted = options.accepted ?? ACCEPTED_MISSING;
  const addresses = addressesOf(tracked);

  const findings = [];
  for (const document of tracked.filter((file) => DOCUMENT.test(file))) {
    const text = options.read ? options.read(document) : readFileSync(`${root}/${document}`, "utf8");
    text.split("\n").forEach((line, index) => {
      for (const [, token] of line.matchAll(BACKTICKED)) {
        const path = token.trim();
        if (!PATH_LIKE.test(path) || accepted.has(path)) continue;
        if (!resolves(path, addresses)) findings.push({ document, line: index + 1, path });
      }
    });
  }
  return findings;
}

export function formatFindings(findings) {
  if (findings.length === 0) return "documented-path scan: clean";
  const lines = findings.map(({ document, line, path }) => `${document}:${line}  ${path}`);
  lines.push(
    "",
    "These paths are named in the documentation and are not in the tree. Point",
    "them at what the file became, or add the path to ACCEPTED_MISSING with a",
    "reason if naming something absent is the point.",
  );
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = scanDocPaths();
  console.log(formatFindings(findings));
  if (findings.length > 0) process.exitCode = 1;
}
