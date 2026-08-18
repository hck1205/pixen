/**
 * Independence scan.
 *
 * Pixen is an independent implementation. That claim is only worth anything if
 * something checks it on every run, so this script enforces the three ways the
 * claim could quietly stop being true:
 *
 *   1. A third-party product or library name appearing in our source, docs or
 *      commit-tracked assets — the first symptom of code or copy being lifted.
 *   2. A third-party runtime dependency creeping into a published package,
 *      which ships someone else's code and licence inside ours.
 *   3. Vendored, minified or licence-headered files landing in the tree.
 *
 * It is not a legal review. It is a tripwire that keeps an honest project
 * honest between reviews.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Names of third-party image editors, editing libraries and graphics toolkits.
 * A hit is not automatically a violation — it is a prompt to explain, in a
 * review, why the name is there.
 */
export const THIRD_PARTY_NAMES = [
  "pintura",
  "pqina",
  "filepond",
  "doka",
  "cropperjs",
  "cropper\\.js",
  "croppie",
  "jcrop",
  "tui-image-editor",
  "toast-?ui",
  "filerobot",
  "img\\.ly",
  "imgly",
  "photoeditorsdk",
  "photo editor sdk",
  "aviary",
  "picsart",
  "fotor",
  "canva\\b",
  "photoshop",
  "lightroom",
  "\\bgimp\\b",
  "fabric\\.?js",
  "\\bkonva\\b",
  "paper\\.js",
  "\\bjimp\\b",
  "fileuploader",
];

/** Paths whose whole job is to talk about this policy, plus generated files. */
const NAME_SCAN_EXCLUDES = [
  "scripts/independence-scan.mjs",
  "tests/unit/independence.test.ts",
  "pnpm-lock.yaml",
];

const BINARY_OR_GENERATED = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|zip|pdf)$/i;

/** Published packages: everything under packages/ that is not marked private. */
const PUBLISHED_PACKAGES = ["packages/core", "packages/web", "packages/react"];

/** The only runtime dependencies a published package may declare. */
const ALLOWED_RUNTIME_PREFIXES = ["@pixen/"];
/** Peer dependencies the host already provides are not our code to ship. */
const ALLOWED_PEER_DEPENDENCIES = ["react", "vue", "svelte"];

export function trackedFiles(root) {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

function scanNames(root, files) {
  const pattern = new RegExp(`(${THIRD_PARTY_NAMES.join("|")})`, "i");
  const findings = [];

  for (const file of files) {
    if (NAME_SCAN_EXCLUDES.includes(file) || BINARY_OR_GENERATED.test(file)) continue;

    let contents;
    try {
      contents = readFileSync(join(root, file), "utf8");
    } catch {
      continue; // unreadable or binary; nothing to claim about it
    }

    contents.split("\n").forEach((line, index) => {
      const match = pattern.exec(line);
      if (!match) return;
      findings.push({
        rule: "third-party-name",
        file,
        line: index + 1,
        detail: `mentions "${match[1]}"`,
        excerpt: line.trim().slice(0, 120),
      });
    });
  }
  return findings;
}

function scanDependencies(root) {
  const findings = [];

  for (const packageDir of PUBLISHED_PACKAGES) {
    const manifestPath = join(root, packageDir, "package.json");
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      findings.push({
        rule: "dependency-policy",
        file: posix.join(packageDir, "package.json"),
        line: 1,
        detail: "package manifest is missing or unreadable",
      });
      continue;
    }

    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (ALLOWED_RUNTIME_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
      findings.push({
        rule: "dependency-policy",
        file: posix.join(packageDir, "package.json"),
        line: 1,
        detail: `runtime dependency "${name}" is third-party code shipped inside ours`,
      });
    }

    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (ALLOWED_PEER_DEPENDENCIES.includes(name)) continue;
      findings.push({
        rule: "dependency-policy",
        file: posix.join(packageDir, "package.json"),
        line: 1,
        detail: `peer dependency "${name}" is not on the allowed list`,
      });
    }
  }
  return findings;
}

function scanVendoredFiles(root, files) {
  const findings = [];
  const vendorPath = /(^|\/)(vendor|vendored|third_party|third-party|lib\/external)(\/|$)/i;
  const minified = /\.min\.(js|css|mjs)$/i;
  const sourceTree = /^(packages|apps)\//;

  for (const file of files) {
    if (vendorPath.test(file)) {
      findings.push({ rule: "vendored-code", file, line: 1, detail: "vendored third-party directory" });
      continue;
    }
    if (minified.test(file)) {
      findings.push({ rule: "vendored-code", file, line: 1, detail: "minified bundle committed to the tree" });
      continue;
    }
    if (!sourceTree.test(file) || BINARY_OR_GENERATED.test(file)) continue;

    let contents;
    try {
      contents = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    // A copyright or SPDX header inside our own source is the signature of a
    // pasted file. Ours carry none.
    const header = /(^|\n)\s*(\*|\/\/|#)?\s*(Copyright \(c\)|SPDX-License-Identifier|@license)/i.exec(contents);
    if (header) {
      findings.push({
        rule: "foreign-header",
        file,
        line: contents.slice(0, header.index).split("\n").length,
        detail: "third-party licence or copyright header in first-party source",
      });
    }
  }
  return findings;
}

/** Runs every rule. An empty array means the tree still matches the claim. */
export function scanRepository(root = process.cwd()) {
  const files = trackedFiles(root);
  return [...scanNames(root, files), ...scanDependencies(root), ...scanVendoredFiles(root, files)];
}

export function formatFindings(findings) {
  if (findings.length === 0) return "independence scan: clean";
  return findings
    .map((finding) => `${finding.file}:${finding.line}  [${finding.rule}] ${finding.detail}`)
    .join("\n");
}

// CLI entry point: `node scripts/independence-scan.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = scanRepository(process.cwd());
  console.log(formatFindings(findings));
  if (findings.length > 0) {
    console.log(`\n${findings.length} finding(s). Each one needs an explanation before it is committed.`);
    process.exit(1);
  }
}
