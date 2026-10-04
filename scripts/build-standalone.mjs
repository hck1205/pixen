/**
 * The single-file build, for a page with no bundler.
 *
 * `@pixen/web` publishes ES modules with bare specifiers — `@pixen/core` — which
 * a browser cannot resolve on its own. That is right for an application with a
 * build step and useless to everyone else: a Rails template, a Django page, a
 * WordPress plugin, a Cordova shell, anything served as HTML. Those pages have
 * `<script>` and nothing else, and this is the file they load.
 *
 * One artefact rather than three. A modern browser has had modules since 2017,
 * so a module is what this is; the older shapes — IIFE, UMD — buy compatibility
 * with browsers that fall below the floor in `docs/BROWSER-SUPPORT.md` anyway,
 * and shipping a build nobody can use the rest of the editor in would be a
 * kindness that lies.
 *
 * Everything is inlined and nothing is external, which is the whole point: the
 * file is self-contained, so there is nothing to resolve and no import map to
 * write.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";

/** Where the file lands, next to the module build it is made from. */
const OUT = "packages/web/dist/standalone/pixen.js";

/** Which browsers the output has to run in. See docs/BROWSER-SUPPORT.md. */
const TARGETS = ["chrome84", "edge84", "firefox90", "safari15"];

mkdirSync("packages/web/dist/standalone", { recursive: true });

execFileSync(
  "node",
  [
    "node_modules/esbuild/bin/esbuild",
    "packages/web/dist/index.js",
    "--bundle",
    "--format=esm",
    "--minify",
    `--target=${TARGETS.join(",")}`,
    "--legal-comments=none",
    `--outfile=${OUT}`,
  ],
  { stdio: "inherit" },
);

const { size } = statSync(OUT);
console.log(`${OUT}: ${size.toLocaleString()} bytes`);
