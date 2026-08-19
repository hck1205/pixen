/**
 * Unused-export scan.
 *
 * Pre-1.0, every export is a contract someone may depend on, and an export
 * nothing uses is a contract with no customer. This finds them, so "delete
 * rather than deprecate" is a check rather than a good intention.
 *
 * Two things are deliberately exported without an internal caller — a seam a
 * host is meant to reach for. They are listed here rather than hidden, so the
 * list stays short and each entry has to justify itself.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const INTENTIONAL_PUBLIC_API = new Set([
  // Hosts that want pixels rather than a blob: a WebGL upload, an ImageData read.
  "renderDocumentToCanvas",
  // The decompression-bomb ceiling, documented in docs/SECURITY.md.
  "MAX_CANVAS_PIXELS",
]);

const SOURCE = /^packages\/[^/]+\/src\/.*\.tsx?$/;
const READABLE = /\.(ts|tsx|md)$/;

export function scanUnusedExports(root = process.cwd()) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((file) => READABLE.test(file));

  const contents = new Map();
  for (const file of tracked) {
    try {
      contents.set(file, readFileSync(`${root}/${file}`, "utf8"));
    } catch {
      // A file listed but unreadable cannot hide a usage worth reporting.
    }
  }

  const findings = [];
  for (const [file, source] of contents) {
    // Barrels re-export by definition; they prove nothing about usage.
    if (!SOURCE.test(file) || file.endsWith("index.ts")) continue;

    const names = [...source.matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map((match) => match[1]);
    for (const name of names) {
      if (INTENTIONAL_PUBLIC_API.has(name)) continue;
      const pattern = new RegExp(`\\b${name}\\b`, "g");

      let usedElsewhere = 0;
      for (const [other, text] of contents) {
        if (other === file) continue;
        usedElsewhere += (text.match(pattern) ?? []).length;
        if (usedElsewhere > 0) break;
      }
      if (usedElsewhere === 0) findings.push({ file, name });
    }
  }
  return findings;
}

export function formatFindings(findings) {
  if (findings.length === 0) return "unused-export scan: clean";
  return findings
    .map((finding) => `${finding.file}: ${finding.name} is exported but nothing imports it`)
    .join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = scanUnusedExports(process.cwd());
  console.log(formatFindings(findings));
  if (findings.length > 0) {
    console.log(
      `\n${findings.length} unused export(s). Delete them, stop exporting them, or add them to INTENTIONAL_PUBLIC_API with a reason.`,
    );
    process.exit(1);
  }
}
