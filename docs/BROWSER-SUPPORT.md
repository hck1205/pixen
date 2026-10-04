# Browser support

Pixen's policy is **degrade, never fail**. Where a modern API would be faster or
simpler, the engine uses it when it is there and falls back when it is not, so a
browser two or three years behind still edits and exports correctly — just with
a slower path or a small cosmetic difference.

Nothing here is guesswork about what a browser "probably" has: every fallback
listed below exists in the code, and `getSupportReport()` reports which ones are
in play at runtime.

## Supported versions

| Engine | Minimum | What sets the floor |
| --- | --- | --- |
| Chrome / Edge | 84 | Private class methods |
| Firefox | 90 | Private class methods |
| Safari (macOS) | 15 | Private class methods, `createImageBitmap` |
| Safari (iOS/iPadOS) | 15 | Same |
| Samsung Internet | 14 | Tracks Chrome 87 |

Below the floor the package still parses — it is standard ESM — but the engine
will not construct. Check before you mount:

```js
import { getSupportReport, summariseSupport } from "@pixen/core";

const report = getSupportReport();
if (report.level === "unsupported") {
  showPlainUploadForm();          // report.engine.blockers says why
} else {
  mountEditor();                  // report.level may still be "degraded"
}
console.info(summariseSupport(report));
```

`report` separates the two surfaces, because they fail independently: the
headless engine needs only a 2D canvas, while `<pixen-image-editor>` also needs
custom elements and shadow DOM. A browser can run the engine — decode, crop,
resize, export — with no UI at all.

## Progressive enhancement

Each row is used when present and replaced when absent. Nothing in this table
prevents an edit or an export.

| Feature | Available from | Without it |
| --- | --- | --- |
| `OffscreenCanvas` | Chrome 69 · Firefox 105 · Safari 16.4 | A DOM canvas is used; decode and encode stay on the main thread |
| `Worker` + blob URLs | Everywhere, unless a CSP forbids `worker-src blob:` | Decode and encode stay on the main thread |
| Canvas `filter` | Chrome 52 · Firefox 49 · Safari 16.4 | Brightness, contrast and saturation run per pixel — same result, slower on large exports |
| `createImageBitmap` | Chrome 50 · Firefox 42 · Safari 15 | Images decode through an `<img>` element: slower, more memory |
| `CanvasRenderingContext2D.roundRect` | Chrome 99 · Firefox 112 · Safari 16.4 | Rounded annotation corners render square |
| `structuredClone` | Chrome 98 · Firefox 94 · Safari 15.4 | Snapshots clone through JSON |
| `Blob.arrayBuffer` | Chrome 76 · Firefox 69 · Safari 14 | EXIF orientation is not read, so rotated photos may load sideways |
| `ResizeObserver` | Chrome 64 · Firefox 69 · Safari 13.1 | The view does not re-fit automatically when the editor is resized |
| CSS container queries | Chrome 105 · Firefox 110 · Safari 16 | The compact layout keys on the viewport instead of the editor's own box |
| CSS `color-mix()` | Chrome 111 · Firefox 113 · Safari 16.2 | The drop overlay uses a flat tint |
| `backdrop-filter` | Chrome 76 · Firefox 103 · Safari 9 (prefixed) | Floating chrome is solid rather than frosted |
| `:focus-visible` | Chrome 86 · Firefox 85 · Safari 15.4 | Focus rings also appear on pointer focus |
| WebP encoding | Chrome 32 · Firefox 96 · Safari 14 | `export()` returns PNG; check first with `isFormatSupported("image/webp")` |

## Server-side rendering

Importing any Pixen package on a server is safe. The custom element extends a
stand-in when `HTMLElement` is missing, and registration is a no-op without
`customElements`, so Next.js, Nuxt, SvelteKit, Astro and Remix can import it from
shared modules without a dynamic import. A node test covers exactly this, because
the failure mode is an import-time crash rather than a render-time one.

## What is verified, and how

- **Unit tests** run in node against the pure modules, including the capability
  report itself.
- **Browser tests** run in Chromium on every CI run: decoding, canvas output,
  pointer gestures, encoders, and layout containment at three viewport sizes.
- **Other engines** run from the same suite on request:
  `PIXEN_BROWSERS=all pnpm test:browser` adds WebKit and Firefox, after
  `pnpm exec playwright install webkit firefox`. WebKit is the closest available
  stand-in for Safari; it is not Safari, so the device list below still matters.
- **Devices** are checked by hand before a release: iOS Safari, Android Chrome,
  Safari on macOS, and one low-memory Android device for the large-image paths.

## Known limits

- **SVG input is refused** on purpose (`UNSUPPORTED_FORMAT`); see
  [SECURITY.md](SECURITY.md).
- **Decode and encode run on a worker** where the browser allows it, so a large
  photograph no longer freezes the interface while it is read or written. The
  worker ships inside the bundle as a blob URL, which means there is no second
  file to serve and no build configuration — but also that a
  `Content-Security-Policy` without `worker-src blob:` will refuse it. Every
  path degrades: no `Worker`, no `OffscreenCanvas`, a policy that says no, or a
  worker that stops answering all fall back to the main thread, which is exactly
  what ran before.

  Two deliberate limits. Blobs under 512 KB decode inline, because the round
  trip costs more than it saves; and the byte-budget search encodes on the main
  thread, because it tries up to five times and reading the canvas back for each
  attempt would cost more than the offload returns.
- **EXIF orientation is applied once, by whichever of us does it.** A rotated
  photograph used to arrive as stored, and turning it upright was the
  application's job. That is no longer true: Chromium turns all eight
  orientations itself, and — measured — `createImageBitmap(blob, {
  imageOrientation: "none" })` does not stop it. A library that turns the pixels
  as well turns them twice, which is a photograph on its side.

  There is no capability to test for this and no version to key off, so Pixen
  asks: the first time a rotated image is opened, a tiny picture whose right way
  up is known is put through the same decoder, and what comes back decides. The
  answer is kept for the session, and a browser with no rotated images to open
  never pays for it. If the probe fails for any reason the answer is "the
  decoder did not", which is what Pixen has always assumed.
- **Downscaling is left to the browser on export.** The standard advice for
  shrinking an image by more than about half is to halve it in steps first, on
  the grounds that a single `drawImage` keeps one sample per output pixel and
  turns fine detail into aliasing. Pixen does that for the *preview*, where one
  proxy is reused for every frame, and deliberately does not for the export.

  The reason is a measurement rather than a preference. Rendering a 1-pixel
  checkerboard and a fine stripe pattern down by factors of 20 and 32, upright
  and rotated, Chromium's single draw and a chain of halvings were
  indistinguishable; against an exactly computed area average, both were off by
  the same amount. On a 6000 × 4000 source the halvings added roughly 560 ms per
  export. Paying that on every browser to fix something one of them does not
  have is the wrong default.

  This is measured on Chromium only, which is the engine this repository can
  drive. If you have measured otherwise on the engines you ship to, the
  `resample` hook on `export()` puts your own downscaler in that exact place —
  including Pixen's own `drawResized`, which is exported for it. See
  [FRAMEWORKS.md](FRAMEWORKS.md).
- **Very large images** are bounded at 268,435,456 pixels (16384 × 16384), above
  which `MEMORY_LIMIT` is raised rather than the tab being killed. That is a
  decompression-bomb guard and stays a refusal: nothing that large was meant.

  What a device will *really* allocate is another matter, and it is well below
  that — low enough on some phones that a photograph taken on the same phone
  does not fit. The failure there is the bad part: an over-large canvas comes
  back blank or transparent rather than throwing, so the export is silently
  wrong and nothing says why.

  Pixen does not guess a number for your device — there is no honest way to
  measure a limit without allocating up to it, and a page that does that on load
  is a page that sometimes crashes on load. Instead `export({ maxPixels })`
  takes one from you, and an export past it is **scaled to fit rather than
  refused**, keeping its shape. The size in the result is the size you got, so
  read it back rather than assuming what was asked for.
