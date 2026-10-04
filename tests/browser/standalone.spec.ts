import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * The single-file build, on a page with no bundler.
 *
 * `@pixen/web` publishes ES modules with bare specifiers, which a browser
 * cannot resolve on its own. That is right for an application with a build step
 * and useless to everyone else — a Rails template, a Django page, a Cordova
 * shell — so there is one self-contained file for them, and this is the test
 * that it actually runs there.
 *
 * Served from disk through the router rather than from the playground: the
 * whole point is a page that has none of the playground's machinery.
 */
const STANDALONE = "packages/web/dist/standalone/pixen.js";

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>a page with no bundler</title>
<style>pixen-image-editor { display: block; width: 800px; height: 500px; }</style>
<pixen-image-editor id="editor" locale="en"></pixen-image-editor>
<script type="module">
  import { registerLocale } from "./pixen.js";
  window.__pixen = { registerLocale };
</script>`;

test("the single-file build runs on a page that has no bundler", async ({ page }) => {
  const bundle = readFileSync(STANDALONE, "utf8");
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));

  await page.route("https://pixen.test/", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE }),
  );
  await page.route("https://pixen.test/pixen.js", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: bundle }),
  );

  await page.goto("https://pixen.test/");
  await page.waitForFunction(() => Boolean((window as unknown as { __pixen?: unknown }).__pixen));

  const outcome = await page.evaluate(async () => {
    const element = document.querySelector("#editor") as HTMLElement & {
      editor: {
        ready: boolean;
        load(input: string): Promise<unknown>;
        export(options: { format: string }): Promise<{ format: string; bytes: number; width: number; height: number }>;
      };
    };

    // A picture the way a plain page would have one: a data URL.
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 120;
    const paint = canvas.getContext("2d")!;
    paint.fillStyle = "#4488ff";
    paint.fillRect(0, 0, 200, 120);
    await element.editor.load(canvas.toDataURL());
    const written = await element.editor.export({ format: "image/png" });

    return {
      defined: Boolean(customElements.get("pixen-image-editor")),
      canvasInside: Boolean(element.shadowRoot?.querySelector("canvas")),
      ready: element.editor.ready,
      written: { format: written.format, bytes: written.bytes, size: `${written.width}x${written.height}` },
      registerLocale: typeof (window as unknown as { __pixen: { registerLocale: unknown } }).__pixen.registerLocale,
    };
  });

  // Nothing failed to resolve, which is the thing a bare specifier would break.
  expect(failures).toEqual([]);
  expect(outcome.defined).toBe(true);
  expect(outcome.canvasInside).toBe(true);
  expect(outcome.ready).toBe(true);
  // And a real file came out of it, not an empty one.
  expect(outcome.written.format).toBe("image/png");
  expect(outcome.written.size).toBe("200x120");
  expect(outcome.written.bytes).toBeGreaterThan(100);
  // The named exports are reachable, so a host can register a locale.
  expect(outcome.registerLocale).toBe("function");
});
