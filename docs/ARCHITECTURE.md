# Architecture

## Layers

```
                      Customer application
                               │
              React  ·  Vue  ·  Svelte  (thin wrappers)
                               │
                    <pixen-image-editor>          @pixen/web
                               │
                    Editor UI  ·  Viewport
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
    Engine                 Resources               Renderer         @pixen/core
 commands · history       blobs · bitmaps        scene · canvas2d
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                   Serialisable EditorDocument
                               │
                        Export pipeline
```

The rule that keeps this honest: **the document is data, the resources are
runtime, the renderer is a projection, and the UI is only interaction.**

## Coordinate spaces

Coordinate handling is the part of an image editor that decays first, so all of
it lives in `packages/core/src/geometry/spaces.ts`.

| Space | Origin | What lives here |
| --- | --- | --- |
| **image** | top-left of the decoded, EXIF-corrected source | annotation layers, source dimensions |
| **stage** | top-left of the image's rotated bounding box | the crop rect |
| **output** | top-left of the export | exported pixels |
| **view** | top-left of the canvas element | pointers, overlays |

Consequences worth stating:

- Layers are stored in image space, so rotating or flipping never rewrites layer
  coordinates — the same matrix that moves the image moves the annotations.
- The crop rect is axis-aligned in stage space, so it stays a plain rect no
  matter how the image is rotated. Rotating remaps the rect through image space
  (`commands.remapCrop`) so the selected content stays selected.
- Quarter turns are snapped to exact axes. `Math.cos(Math.PI / 2)` is 6.1e-17,
  and left alone that residue turns a 90° rotation of a 400×200 image into a
  200.00000000000003-wide stage — which then leaks into crops, exports and saved
  documents.

## Preview versus export resolution

The viewport renders a downscaled proxy bitmap from the `ResourceManager`
(default longest edge 2048px); the export pipeline always re-renders from the
full-resolution source. Editing resolution and output resolution are
deliberately decoupled — that is what keeps a 48-megapixel image interactive on a
phone without ever degrading the exported file.

The same `createScene` code produces both. They differ only in which region they
render (`crop` versus `stage`) and how the region maps onto the target
(`fit: "stretch"` for export, `fit: "none"` plus a view matrix for the viewport).

## Pure core, imperative shell

Every part of Pixen that *decides* something is a pure function over data; the
classes above them only hold the current value, own the effects, and notify
subscribers. The split is what makes the behaviour reachable from an ordinary
unit test instead of only from a browser.

| Decision | Pure module | Shell |
| --- | --- | --- |
| What an edit does to a document | `engine/commands.ts` | — |
| What an intent means for state, history and selection | `engine/session.ts` | `engine/editor.ts` |
| When history records, collapses or refuses | `engine/history.ts` | `engine/editor.ts` |
| What to draw, and in what order | `render/scene.ts`, `render/ops.ts` | `render/canvas2d.ts` |
| What a pointer gesture means | `web/gestures.ts` | `web/viewport.ts` |
| Whether a document is valid, and why | `model/validate.ts` | `model/serialize.ts` |

Two conventions keep it honest:

- **Intents are data.** `editor.dispatch({ kind: "rotate-quarter-turns", turns: 1 })`
  is the same thing `editor.rotateRight()` does, and it can be logged, queued,
  replayed or asserted on. The one exception is `{ kind: "transform" }`, the
  escape hatch a plugin needs to run a command the union does not model.
- **Failures are values inside, exceptions at the edge.** Validation, history
  transitions and the session reducer return `Result<T, E>`; the `Editor` throws
  at the public boundary because that is what JavaScript hosts expect. Validation
  accumulates every issue rather than stopping at the first.

The renderer follows the same rule: `buildSceneOps` turns a scene into a list of
drawing operations — paths, transforms, text runs — and `executeOps` applies them
to a canvas. Arrow-head geometry, text wrapping, rotation centres and the
adjustment fallback are therefore all testable in node, with no canvas involved.
The op list is also the seam a second renderer would plug into.

## History and transactions

History stores snapshots, not inverse commands. That is affordable precisely
because documents contain no pixels: a snapshot is a small JSON object while the
bitmaps stay in the resource manager.

A pointer drag emits dozens of document states, and all of them must undo as one
step, so the engine has explicit transactions:

```js
editor.beginTransaction("Crop");   // pointerdown
editor.dragCropHandle(...);        // pointermove, many times — transient
editor.commitTransaction();        // pointerup, one undo entry
```

Changes made inside a transaction are marked `transient` in the `change` event,
which lets a host throttle expensive work (autosave, previews) until the gesture
ends. A gesture that ends where it started records nothing.

## Rendering

V1 renders with Canvas2D only. A WebGL backend would double the surface area
before the coordinate model has been proven in production, and the seam for one
already exists: `createScene` produces a renderer-independent draw list.

Colour adjustments use the canvas `filter` property, with a pixel-level fallback
that matches the same maths for engines that lack it — a preview and an export
must not disagree because of a browser capability.

## Source layout

Folders are concerns, and a concern that grows its own parts becomes a folder
with a barrel — the same shape repeated at every depth:

```
packages/web/src/
  element/          the custom element and everything it owns
    chrome/         what the UI is made of
      inspector/    one module per section: crop, style, layer, adjustments, view
    dom/            button, input, field factories; in-place state updates
    input/          what a keystroke or a drop means, as pure functions
    constants.ts    every literal the chrome depends on, named
  viewport/         canvas, gestures, overlay geometry, view fitting
  tools/            what a tool is, and how new annotations look
  bindings/         what a framework wrapper needs: events, property mapping
  i18n/             one module per locale, plus the registry
  theme/            styles and icons
```

`bindings/` exists because `@pixen/react` and `@pixen/vue` were copying the same
event list and the same "a URL is an attribute, a Blob is a load" rule. They
share it now, so a third wrapper starts with the mapping already written and the
two cannot drift apart.

The rule that produces this: **the module that decides is pure and tested, the
module that acts is thin.** `input/keyboard.ts` resolves a keystroke to an
action; the element switches over it. `chrome/inspector/sections.ts` decides
which section to show; the builders only know how to build one.

## Package boundaries

- `@pixen/core` — no DOM beyond canvas; runs in a page, a worker or a test.
- `@pixen/web` — the custom element. Owns the DOM, delegates all state to the
  engine, and exposes the engine as `element.editor`.
- `@pixen/react` — props to properties, events to callbacks. It reimplements
  nothing; the engine remains the single source of truth so React never holds a
  second copy of the document that can drift.

## Testing

- **Unit** (`vitest`, node): geometry, crop interaction maths, commands, the
  session reducer, history transitions, validation, draw-op building, pointer
  gestures, serialisation, migrations, EXIF, resize and policy rules.
- **Browser** (`playwright`, chromium): the built playground — decode, canvas
  output, pointer gestures, undo semantics, encoders, and whether a redaction
  really removes pixels from the exported file.

The browser suite covers what only a real engine can answer — decoding, canvas
output, encoders, and the DOM plumbing itself. Everything the plumbing *decides*
now has a unit test instead, which is why the browser suite stays small.

It exists because an image editor's worst failures are the ones unit tests
cannot see. Its first run caught four: `ImageBitmap.width` being
read-only during decode, invisible layout rows swallowing canvas pointer events,
`[hidden]` overlays staying visible under our own display rules, and
`preventDefault()` on pointerdown killing keyboard shortcuts.
