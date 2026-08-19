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
2. **Events are DOM `CustomEvent`s** named `pixen-load`, `pixen-change`,
   `pixen-history`, `pixen-export`, `pixen-error` and `pixen-ready`. Each detail
   is on `event.detail`. Frameworks with their own event syntax need their usual
   escape hatch for custom events, shown below.

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

## Server rendering checklist

| Framework | What to do |
| --- | --- |
| Next.js | Import normally. The element only registers in the browser |
| Nuxt | Import normally; add `pixen-` to `vue.compilerOptions.isCustomElement` if you use the raw tag |
| SvelteKit | Import normally |
| Remix / React Router | Import normally |
| Astro | Use a `client:*` directive on the island that renders the editor |
| Angular Universal | Import normally; the element's own registration is a no-op on the server |
