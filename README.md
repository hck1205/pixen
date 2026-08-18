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

## Saving and resuming an edit

The document is plain JSON with a `schemaVersion`, and it never contains pixels:

```js
const saved = editor.toJSON();       // store it anywhere
await editor.restore(saved, file);   // the image bytes come back separately
```

Images live in the `ResourceManager` keyed by id, which is what keeps documents
small, serialisable and safe to diff — and lets memory be released at a point you
choose.

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
pnpm playground     # http://localhost:5173
```

`PIXEN_CHROMIUM_PATH` points the browser suite at an existing Chromium if the
environment already ships one.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, coordinate spaces, why the
  pieces are split the way they are
- [Document schema](docs/DOCUMENT-SCHEMA.md) — the serialised contract and its
  migration policy
- [Roadmap](docs/ROADMAP.md) — what ships when, and what is deliberately out
- [Security](docs/SECURITY.md) — input handling, redaction, privacy
- [Legal checklist](docs/LEGAL-CHECKLIST.md) — pre-release review list

## Privacy

Pixen has no telemetry and makes no network requests of its own. Images are
decoded, edited and encoded in the browser; nothing is uploaded unless your own
code uploads it.

## Licence

See [LICENSE.md](LICENSE.md). Third-party notices are in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
