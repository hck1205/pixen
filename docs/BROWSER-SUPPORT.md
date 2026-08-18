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
| `OffscreenCanvas` | Chrome 69 · Firefox 105 · Safari 16.4 | A DOM canvas is used; rendering cannot move off the main thread |
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
- **Workers are not used yet.** Decode and encode run on the main thread, which
  is visible on very large images on low-end phones. The pipeline is already
  worker-shaped — `OffscreenCanvas` where available, no DOM in the engine — so
  this is a change of execution context, not of architecture.
- **Very large images** are bounded at 268,435,456 pixels (16384 × 16384), above
  which `MEMORY_LIMIT` is raised rather than the tab being killed.
