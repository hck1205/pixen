# Pixen

A browser image editing SDK: crop, rotate, annotate, resize and re-encode on the
client, then upload what the server actually wants.

Pixen is **headless-first**. The engine has no DOM dependency beyond canvas, the
UI is a custom element built on top of it, and the framework packages are thin
adapters over that element. You can use any layer on its own.

> Status: pre-release (v0.1). The document schema is versioned and migratable
> from day one; the UI and the public API are still moving.

## Packages

| Package | What it is |
| --- | --- |
| `@pixen/core` | The engine: document model, geometry, history, renderer, export pipeline, headless processing |
| `@pixen/web` | `<pixen-image-editor>`, the framework-agnostic UI |
| `@pixen/react` | React bindings for the element |
| `@pixen/vue` | Vue 3 bindings for the element |

## Quick start — the element

```html
<script type="module">
  import "@pixen/web";
</script>

<pixen-image-editor src="/photo.jpg" theme="dark" format="image/webp" quality="0.82">
</pixen-image-editor>

<script type="module">
  const editor = document.querySelector("pixen-image-editor");

  editor.addEventListener("pixen-export", (event) => {
    const { blob, width, height, bytes } = event.detail;
    // upload blob
  });

  document.querySelector("#save").addEventListener("click", () => editor.export());
</script>
```

Structured configuration is passed as properties, not attributes:

```js
editor.tools = [
  { type: "crop", options: { ratios: [1, 4 / 3, 16 / 9] } },
  { type: "arrow" },
  { type: "text" },
];
editor.policy = "profile"; // or a policy object
```

## Quick start — React

```tsx
import { PixenImageEditor } from "@pixen/react";

export function AvatarEditor({ file, onSave }) {
  return (
    <PixenImageEditor
      src={file}
      policy="profile"
      onExport={(result) => onSave(result.blob)}
      style={{ height: 560 }}
    />
  );
}
```

## Quick start — Vue

```vue
<script setup>
import { PixenImageEditor } from "@pixen/vue";
</script>

<template>
  <PixenImageEditor src="/photo.jpg" policy="profile" @export="upload($event.blob)" />
</template>
```

Svelte, Angular, Solid, Lit, Astro and plain HTML need no wrapper at all — see
[FRAMEWORKS.md](docs/FRAMEWORKS.md).

## Quick start — headless

No UI, same engine:

```js
import { createEditor } from "@pixen/core";

const editor = createEditor();
await editor.load(file);

editor.crop({ aspectRatio: 16 / 9 }).resize({ width: 1280 });

const { blob, width, height } = await editor.export({ format: "image/webp", quality: 0.82 });
```

Or skip the editor entirely when all you need is an upload optimiser:

```js
import { processImage, processImages } from "@pixen/core";

const result = await processImage(file, {
  maxWidth: 1600,
  format: "image/webp",
  quality: 0.82,
  maxBytes: 800_000, // re-encodes downwards until it fits
});

console.log(result.bytes, result.savedBytes, result.compressionRatio);
```

## Intents

Every state change is an intent, and the convenience methods are shorthand for
dispatching one. Intents are plain data, so they are easy to log, queue, replay
in a test, or send across a worker boundary:

```js
editor.dispatch({ kind: "rotate-quarter-turns", turns: 1 });
editor.dispatch({ kind: "begin-transaction", label: "Drag crop" });
editor.dispatch({ kind: "drag-crop-handle", handle: "bottom-right", pointer: { x: 800, y: 400 } });
editor.dispatch({ kind: "commit-transaction" }); // one undo step
```

The reducer behind them (`session.reduce`) is pure, so editor behaviour can be
tested without constructing an editor at all.

## Saving and resuming an edit

The document is plain JSON with a `schemaVersion`, and it never contains pixels:

```js
const saved = editor.toJSON();       // store it anywhere
await editor.restore(saved, file);   // the image bytes come back separately
```

Images live in the `ResourceManager` keyed by id, which is what keeps documents
small, serialisable and safe to diff — and lets memory be released at a point you
choose.

## Watermarks and stickers

A watermark is a bitmap layer with placement maths, so it undoes, serialises,
exports and survives a rotate like anything else:

```js
const logo = await editor.resources.load(logoFile);

editor.addWatermark({
  resourceId: logo.id,
  size: { width: logo.width, height: logo.height },
  position: "bottom-right",   // or a corner, an edge, "centre", or "tile"
  scale: 0.18,                // fraction of the image's longest edge
  opacity: 0.6,
});
```

## Straightening, frames and credit lines

```js
editor.straighten(3 * Math.PI / 180);   // ±45°, and the crop pulls in to match
editor.setFrame({ style: "rounded", colour: "#ffffff", width: 0.02 });
editor.addTextWatermark({ text: "© Studio", position: "bottom-right" });
```

Straightening is absolute, not cumulative: the slider shows the angle the
document holds. The crop keeps its share of the frame, so straightening to 15°
and back to 0 returns the framing you started with, and a tight crop stays tight
instead of jumping to full frame.

## Adjustments and presets

Nine adjustments — exposure, brightness, contrast, saturation, hue, grayscale,
sepia, invert and vignette — plus nine presets that are nothing more than named
sets of those values:

```js
editor.setAdjustments({ exposure: 0.4, saturation: -0.2, vignette: 0.5 });

// A preset writes the same fields, so it undoes as one step and stays editable.
import { ADJUSTMENT_PRESETS, presetAdjustments } from "@pixen/core";
editor.setAdjustments(presetAdjustments(ADJUSTMENT_PRESETS[1]));
```

## Selecting and transforming a layer

The select tool puts eight resize handles and a rotate grip on the selected
layer, whatever kind it is — a shape, a stroke, text, a sticker or a watermark.
Holding shift locks the layer's own aspect ratio while resizing, and snaps
rotation to 15°. The inspector carries the same two values as sliders, for when
an exact angle matters more than a drag.

## Policies

A policy is a named set of output rules — the thing most teams actually want
from an editor:

```js
import { PRESETS, applyPolicy, checkPolicy, policyToProcessOptions } from "@pixen/core";

applyPolicy(editor, {
  aspectRatio: 1,
  minWidth: 800,
  outputWidth: 1024,
  format: "image/webp",
  maxFileSize: 500_000,
});

const violations = checkPolicy("profile", { width: 640, height: 640, bytes: 900_000 });
```

## Development

```bash
pnpm install
pnpm build          # build all three packages
pnpm test           # unit tests (vitest, node)
pnpm test:browser   # Playwright tests against the built playground
pnpm check:independence  # third-party name / dependency / vendored-code scan
pnpm playground     # http://localhost:5173
pnpm stories        # Ladle story browser, http://localhost:61000
```

`PIXEN_CHROMIUM_PATH` points the browser suite at an existing Chromium if the
environment already ships one.

## Independence

Pixen is written from web platform specifications, the Exif/TIFF format
specification and first principles — no other image editor or editing library
was used as a reference, and the published packages carry **zero third-party
runtime dependencies**. Per-module sources are recorded in
[docs/PROVENANCE.md](docs/PROVENANCE.md), and `scripts/independence-scan.mjs`
enforces it on every test run and in CI.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, coordinate spaces, why the
  pieces are split the way they are
- [Document schema](docs/DOCUMENT-SCHEMA.md) — the serialised contract and its
  migration policy
- [Roadmap](docs/ROADMAP.md) — what ships when, and what is deliberately out
- [Frameworks](docs/FRAMEWORKS.md) — React, Vue, Svelte, Angular, Solid, Lit,
  Astro, plain HTML, and server rendering
- [Browser support](docs/BROWSER-SUPPORT.md) — supported versions, what degrades
  where, and how to check at runtime
- [Security](docs/SECURITY.md) — input handling, redaction, privacy
- [Provenance](docs/PROVENANCE.md) — where every non-obvious algorithm comes from
- [Contributing](CONTRIBUTING.md) — the clean-room and dependency rules
- **Stories** (`pnpm stories`) — every UI state on one page: themes, tools,
  policies, locales, slots, tokens, and the compact layouts
- [Legal checklist](docs/LEGAL-CHECKLIST.md) — pre-release review list, with the
  latest independence audit

## Privacy

Pixen has no telemetry and makes no network requests of its own. Images are
decoded, edited and encoded in the browser; nothing is uploaded unless your own
code uploads it.

## Licence

See [LICENSE.md](LICENSE.md). Third-party notices are in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
