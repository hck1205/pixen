/**
 * The evidence a page may cite, read off the tree.
 *
 * Two pages — coverage and verification — check that every unit test, story and
 * browser spec they name exists. They used to each keep their own copy of these
 * three lookups, and the copies disagreed the first time one of them had to
 * change: the unit-test walk went recursive in one file and not the other, and
 * a citation of `gestures/lifecycle.test.ts` passed one check and failed the
 * next. One home, so the two pages cannot be checked by two different rules.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = new URL("../../", import.meta.url).pathname;

/**
 * Every unit test file, by the name a citation uses: bare for the top of a test
 * folder, `gestures/lifecycle.test.ts` for one that mirrors a source folder.
 */
export function unitTestFiles(): Set<string> {
  const files = new Set<string>();
  const walk = (directory: string, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(directory, entry.name), `${prefix}${entry.name}/`);
      else files.add(`${prefix}${entry.name}`);
    }
  };
  walk(`${ROOT}tests/unit`);
  for (const pkg of readdirSync(`${ROOT}packages`)) {
    const directory = `${ROOT}packages/${pkg}/test`;
    if (existsSync(directory)) walk(directory);
  }
  return files;
}

/** Every story the browser can show, including the ones in subfolders. */
export function storyNames(directory = `${ROOT}apps/stories/src`, names = new Set<string>()): Set<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      storyNames(path, names);
      continue;
    }
    if (!entry.name.endsWith(".stories.tsx")) continue;
    for (const match of readFileSync(path, "utf8").matchAll(/^export const (\w+): Story/gm)) {
      names.add(match[1]!);
    }
  }
  return names;
}

/** Every Playwright spec, by file name. */
export function browserTestFiles(): Set<string> {
  return new Set(readdirSync(`${ROOT}tests/browser`));
}
