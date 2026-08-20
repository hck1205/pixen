# Using Pixen with any framework

Pixen ships its UI as a custom element, `<pixen-image-editor>`. That is a browser
primitive, not a framework feature, so **every framework can already render it**
— the wrapper packages exist for ergonomics and types, not for capability.

Three levels, and you can stop at whichever suits you:

| Level | What you write | When |
| --- | --- | --- |
| **Element** | `<pixen-image-editor>` | Any framework, or none |
| **Wrapper** | `<PixenImageEditor />` | React and Vue today, where props and events are nicer typed |
| **Headless** | `createEditor()` / `processImage()` | Your own UI, a worker, or a build step |

Server rendering is safe everywhere: importing any Pixen package on a server does
not touch `HTMLElement`, `window` or `customElements`, so no dynamic import
dance is needed. See [BROWSER-SUPPORT.md](BROWSER-SUPPORT.md#server-side-rendering).

## The two rules that cover every framework

1. **Attributes are for scalars, properties are for everything else.** `src`,
   `theme`, `locale`, `format`, `quality` and `preset` are attributes. `tools`,
   `aspectRatios`, `policy` and `document` are objects and arrays, so they are
   set as JavaScript properties — HTML attributes can only carry strings.
   Two more properties are for driving the interface rather than describing the
   picture: `tool` chooses the armed tool, and `panel` opens an inspector panel
   (`"tool"`, `"adjust"`, `"layers"` or `"output"`). An application that exists
   to resize can open the output panel on load and leave it there.
   Two are for the host's own work rather than the picture's: `status` puts a
   message over the picture while a round trip runs, and `disabled` blocks
   input without hiding anything. Both are properties; `disabled` also reflects
   to an attribute so CSS can see it.
2. **Events are DOM `CustomEvent`s.** Each detail is on `event.detail`.
   Frameworks with their own event syntax need their usual escape hatch for
   custom events, shown below.

   | Event | Detail | When |
   | --- | --- | --- |
   | `pixen-ready` | `{ editor }` | The element is connected and the engine exists |
   | `pixen-load-start` | `{ replace }` | A load began; `replace` is true for `replaceSource` |
   | `pixen-load-progress` | `ProgressReport` | A step of the load reported itself |
   | `pixen-load-abort` | `{ reason }` | The load was called off — `"cancelled"` or `"superseded"` |
   | `pixen-load` | `{ document }` | The picture is loaded and the element's attributes are applied |
   | `pixen-change` | `{ document, reason, transient }` | Any state change, including mid-gesture ones |
   | `pixen-history` | `HistorySummary` | Undo or redo availability changed |
   | `pixen-export-start` | `{ format }` | An export began, in the format it will produce |
   | `pixen-export-progress` | `ProgressReport` | A step of the export reported itself |
   | `pixen-export-abort` | `{ reason }` | The export was called off |
   | `pixen-export` | `ExportResult` | A file was produced |
   | `pixen-error` | `{ error }` | Something failed. A cancellation is not a failure and never arrives here |

   Every start is followed by exactly one of its completion, its abort or an
   error, so a host can turn a busy state on at the start and be certain
   something turns it off.

3. **Progress is counted or it is null.** `ProgressReport` carries
   `{ task, stage, loaded, total, ratio }`. `ratio` is `null` whenever the step
   has nothing countable in it — a decode is one call into the browser, and a
   render is one pass over the scene. It is a real fraction where something was
   genuinely measured: bytes arriving over the network, re-encode attempts under
   a `maxBytes` budget, and files in a multi-size export. Bind a determinate bar
   to `ratio` and fall back to a spinner when it is null; nothing here estimates.

## React

```tsx
import { PixenImageEditor } from "@pixen/react";

<PixenImageEditor src={file} policy="profile" onExport={(r) => upload(r.blob)} />;
```

Without the wrapper — React 19 passes unknown props to custom elements, so the
element works directly:

```tsx
<pixen-image-editor ref={ref} src="/photo.jpg" theme="dark" />
```

Declare the tag for TypeScript once:

```ts
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "pixen-image-editor": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        theme?: "dark" | "light";
      };
    }
  }
}
```

## Vue 3

```vue
<script setup lang="ts">
import { PixenImageEditor } from "@pixen/vue";
const onExport = (result) => upload(result.blob);
</script>

<template>
  <PixenImageEditor src="/photo.jpg" policy="profile" @export="onExport" />
</template>
```

Without the wrapper, tell the compiler the tag is a custom element:

```ts
// vite.config.ts
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith("pixen-") } } });
```

```vue
<pixen-image-editor ref="editor" src="/photo.jpg" @pixen-export="onExport" />
```

Vue binds a non-string value as a property automatically when the element has a
matching property, so `:tools="tools"` works.

## Svelte

Svelte renders custom elements natively, so `@pixen/svelte` is not a component —
it is an action, for the one thing the element cannot do for itself: keeping
structured properties and event handlers in step with reactive values.

```svelte
<script>
  import { pixen } from "@pixen/svelte";
  let tools = ["crop", "redact"];
</script>

<pixen-image-editor
  use:pixen={{ src, tools, export: (result) => upload(result.blob) }}
  theme="dark"
/>
```

The package contains no Svelte dependency and no compiler: an action is a plain
function with `update` and `destroy`, which is a contract rather than a
framework, so it works in Svelte 4 and 5 alike.

Without it, the element works on its own:

```svelte
<script>
  import "@pixen/web";
  let editor;
  $: if (editor) editor.tools = ["crop", "redact"];
</script>

<pixen-image-editor bind:this={editor} src="/photo.jpg" theme="dark"
  on:pixen-export={(event) => upload(event.detail.blob)} />
```

In Svelte 5 use `onpixen-export` or `addEventListener` in an effect. SvelteKit
needs nothing special: the import is server-safe.

## Angular

Add the schema once, then use the element with property and event bindings:

```ts
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import "@pixen/web";

@Component({
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <pixen-image-editor #editor src="/photo.jpg" [tools]="tools"
      (pixen-export)="onExport($event)"></pixen-image-editor>
  `,
})
export class AvatarEditor {
  tools = ["crop", "redact"];
  onExport(event: CustomEvent) { this.upload(event.detail.blob); }
}
```

`[tools]` sets the property and `(pixen-export)` listens for the DOM event —
both are standard Angular bindings, so no wrapper is required.

## Solid, Preact, Lit, Qwik, Astro

All four render custom elements directly.

```tsx
// Solid: prop: forces a property, on: attaches a DOM listener
<pixen-image-editor prop:tools={tools} on:pixen-export={onExport} src="/photo.jpg" />
```

```tsx
// Preact passes objects as properties when the element has them
<pixen-image-editor tools={tools} onpixen-export={onExport} src="/photo.jpg" />
```

```ts
// Lit
html`<pixen-image-editor .tools=${tools} @pixen-export=${onExport} src="/photo.jpg"></pixen-image-editor>`
```

```astro
---
import "@pixen/web";
---
<pixen-image-editor src="/photo.jpg" client:load />
```

## Alpine, htmx, Rails, Django, plain HTML

No build step needed:

```html
<script type="module" src="https://esm.sh/@pixen/web"></script>

<pixen-image-editor id="editor" src="/photo.jpg" style="height: 560px"></pixen-image-editor>

<script type="module">
  const editor = document.querySelector("#editor");
  editor.tools = [{ type: "crop", options: { ratios: [1, 16 / 9] } }];
  editor.addEventListener("pixen-export", (event) => upload(event.detail.blob));
</script>
```

## A framework not listed here

The question to ask is only how that framework does two things: set a JavaScript
property on a DOM node, and listen for a `CustomEvent`. If it can do both, Pixen
works — and if it cannot, the headless API needs neither:

```js
import { createEditor } from "@pixen/core";

const editor = createEditor();
await editor.load(file);
editor.crop({ aspectRatio: 1 }).resize({ width: 1024 });
const { blob } = await editor.export({ format: "image/webp" });
```

## Styling it, and replacing its chrome

The element is a shadow root, so a page's stylesheet does not reach inside it.
Two named surfaces are how it is meant to be reached instead, and both are API:
renaming one is a breaking change, and a browser test pins the list.

**Parts** are styled from outside with `::part()`:

| Part | What it is |
| --- | --- |
| `root` | The whole editor box |
| `canvas` | The picture itself |
| `tool-rail` | The row of tools |
| `actions` | Undo, redo, export — the buttons that act on the picture |
| `inspector` | The panel of options for whatever is selected |
| `busy` | The status pill shown while something is loading or exporting |
| `empty` | The empty state, before an image is loaded |
| `dropzone` | The overlay shown while a file is dragged over the editor |
| `text-input` | The field a caption is typed into, over the canvas |

```css
pixen-image-editor::part(tool-rail) {
  border-radius: 0;
}
```

**Slots** replace a piece of chrome entirely with your own:

| Slot | Replaces |
| --- | --- |
| `tools` | The tool rail |
| `actions` | The action buttons |
| `inspector` | The options panel |

```html
<pixen-image-editor>
  <div slot="actions">
    <button onclick="save()">Save to library</button>
  </div>
</pixen-image-editor>
```

A slot with nothing in it keeps Pixen's own chrome, so you replace only what you
mean to. For adding to the chrome rather than replacing it, see
[PLUGINS.md](PLUGINS.md) — a plugin contributes buttons and inspector sections
without taking over the panel they sit in.

## Bending the way in and the way out

Two places an application usually has to change something, and neither should
mean forking the library.

**Reading.** `load` takes decode options. `headers` go on the request for a URL
source, and `beforeDecode` runs before anything tries to decode, which is where
a format no browser reads gets converted:

```js
await editor.load(file, {
  headers: { "X-Tenant": "acme" },
  beforeDecode: async (blob) => (isHeic(blob) ? await toJpeg(blob) : blob),
});
```

Pixen ships no HEIC decoder. Every recent iPhone produces the format and no
browser reads it, but bundling a decoder would put a megabyte in the build of
every application that never sees one. The hook is where a host puts its own.

`afterDecode` is the other side of it: `beforeDecode` takes bytes no browser
reads, and this takes the decoded pixels before anyone edits them — a colour
profile the browser ignored, a denoiser or upscaler compiled to WebAssembly, a
white background composited under a transparent PNG. Going through
`beforeDecode` for any of that would mean decoding and re-encoding to reach the
pixels, which is slower and, for a lossy format, lossy.

```js
await editor.load(file, {
  afterDecode: (image) => denoise(image.source, image.width, image.height),
});
```

The picture arrives upright, so a hook never has to think about EXIF. Draw onto
the surface you were handed and return it and nothing is copied; return a
different one and the old is released for you.

**Through the element**, set them once rather than per call:

```js
editorElement.decodeOptions = { beforeDecode: heicToJpeg };
```

That matters more than it looks. A format no browser reads arrives by being
dropped or pasted far more often than through a `load()` you wrote, and every
one of those paths — the file picker, a drop, a paste, the `src` attribute —
goes through this. Options passed to `element.load(input, options)` win over it
for that one call.

**Writing.** `export` takes `hooks`, at the five points an export has:

| Hook | Gets | For |
| --- | --- | --- |
| `document` | the document about to be drawn | a stamp, a watermark only the export carries, placeholder text filled in |
| `resample` | the source, and the size to shrink it to | your own downscaler, on a large reduction |
| `pixels` | the drawn `CanvasSurface`, in place | a mask, a LUT, anything a canvas can draw |
| `bytes` | the encoded `Blob` | a format the browser cannot write |
| `filename` | the suggested name | whatever the storage layer dictates |

```js
const { blob, filename } = await editor.export({
  format: "image/png",
  hooks: {
    pixels: (surface, size) => {
      const context = surface.context;
      context.globalCompositeOperation = "destination-in";
      context.beginPath();
      context.arc(size.width / 2, size.height / 2, size.width / 2, 0, Math.PI * 2);
      context.fill();
    },
    filename: (suggested) => `avatar-${suggested}`,
  },
});
```

`pixels` is handed the surface rather than a copy of the pixels. An `ImageData`
round trip costs two full-size allocations and gives you an array to loop over;
a canvas gives you every drawing primitive the platform has, for nothing.

`resample` is the one hook that is only sometimes called: it runs when the
export is a large reduction of the crop, and not otherwise. It exists because
Pixen deliberately lets the browser do that downscale — measured on Chromium,
halving in steps first lands no closer to the true area average and adds about
half a second to a 24-megapixel export, so the cost is not imposed on everyone.
If you have measured otherwise on the engines you ship to, or you want a filter
the platform does not have, this is where it goes:

```js
import { drawResized, createSurface } from "@pixen/core";

await editor.export({
  width: 400,
  hooks: {
    resample: (source, from, to) => {
      const surface = createSurface(to.width, to.height);
      drawResized(surface.context, source, from, to);
      return surface.canvas;
    },
  },
});
```

Note what it is asked for: the whole bitmap shrunk by the factor the *crop*
needs, not the export's own size. The scene still has to place the crop, the
straightening and every annotation against that bitmap, so one shrunk to the
export size would arrive already too small. Returning a different size than `to`
is safe — the picture lands in the same place regardless — it only changes the
resolution the resampling happened at. See
[BROWSER-SUPPORT.md](BROWSER-SUPPORT.md) for the measurement.

**A ceiling on the pixels.** Some devices refuse a canvas well below what the
specification allows, and do it by handing back a blank one rather than by
throwing. If you know what your target can allocate, say so and an over-large
export is scaled to fit instead:

```js
const { blob, width, height } = await editor.export({ maxPixels: 16_777_216 });
```

It keeps the picture's shape, and `width`/`height` in the result are what you
actually got — which may be smaller than what you asked for. See
[BROWSER-SUPPORT.md](BROWSER-SUPPORT.md).

**Metadata.** A re-encode loses the camera's own record of the picture, which for
an archive is a real loss and for a shared photograph is usually the point. It is
stripped by default; ask for it and it comes across:

```js
const { blob } = await editor.export({ format: "image/jpeg", metadata: "copy" });
```

What arrives is the source's EXIF minus three things: the orientation (already
spent — the pixels were turned upright at decode), the location, and the embedded
thumbnail, which is a copy of the picture from before it was edited. JPEG to JPEG
only. [SECURITY.md](SECURITY.md) has the reasoning and the limits.

**Delivery.** `exportTo` draws, encodes and uploads as one task, so
`pixen-export-progress` covers all three and one cancel calls off whichever is
running. The bytes on the wire are the one step whose length a server declares,
so that part of the bar is real:

```js
const { status, body } = await editor.exportTo(
  { url: "/api/photos", headers: { Authorization: token } },
  { format: "image/jpeg", quality: 0.82 },
);
```

By default the file goes as multipart under `file`, named after the export.
`fields` replaces that with whatever your endpoint wants.

**Sizing.** `resize` and the export's `width`/`height` accept `fit` when both
edges are given: `force` (the default — the numbers are meant literally),
`contain` (fit inside the box, keeping the ratio), or `cover` (fill it and let
the picture overflow). `preventUpscale` applies last and defaults to on.

**Pixels without a file.** `renderToCanvas()` returns the drawn surface, for a
texture upload, an `ImageData` read, or an encoder of your own.

**Masks.** `renderMask()` returns the annotations alone, in two flat colours,
with the photograph taken out — what a model outside the browser needs in order
to work on part of an image:

```js
const mask = await maskBlob(editor.document, editor.resources, {
  include: (layer) => layer.type === "rect",
  padding: 0.01,
});
```

It is built by recolouring the same draw-op list the editor renders, so the
crop, the output size and every layer's rotation are already resolved. An
outlined shape marks what it encloses rather than its outline, and `padding`
grows every mark — inpainting wants a margin, or a halo of the original is left
behind.

## Server rendering checklist

| Framework | What to do |
| --- | --- |
| Next.js | Import normally. The element only registers in the browser |
| Nuxt | Import normally; add `pixen-` to `vue.compilerOptions.isCustomElement` if you use the raw tag |
| SvelteKit | Import normally |
| Remix / React Router | Import normally |
| Astro | Use a `client:*` directive on the island that renders the editor |
| Angular Universal | Import normally; the element's own registration is a no-op on the server |
