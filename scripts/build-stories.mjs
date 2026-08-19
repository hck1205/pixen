import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * Builds the story browser, and fails when the build fails.
 *
 * The story tool reports a broken build on stdout and then exits 0, which means
 * CI would go green with a story browser that does not build — and the stories
 * are how UI changes are reviewed here, so that is not a warning, it is a
 * failure.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stories = join(root, "apps/stories");
const output = join(stories, "build/index.html");

const before = existsSync(output) ? statSync(output).mtimeMs : 0;

const result = spawnSync("pnpm", ["exec", "ladle", "build"], {
  cwd: stories,
  encoding: "utf8",
  env: process.env,
});

const log = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(log);

const failed =
  result.status !== 0 ||
  /build failed/i.test(log) ||
  !existsSync(output) ||
  statSync(output).mtimeMs <= before;

if (failed) {
  console.error("\nstory build: failed");
  process.exit(1);
}
console.log("story build: clean");
