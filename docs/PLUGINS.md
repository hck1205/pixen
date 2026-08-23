# Plugins

A plugin is a function. It is called once with everything it may touch, and
whatever it returns is how it undoes itself.

```js
import "@pixen/web";

const editor = document.querySelector("pixen-image-editor");

editor.use((context) => {
  const remove = context.addAction({
    id: "save",
    label: "Save to server",
    text: "Save",
    emphasis: "primary",
    onClick: () => void upload(context.editor),
    disabled: () => context.editor.document.layers.length === 0,
  });

  return remove;
});
```

## Why this is small

Most of what a host wants is already reachable without a plugin: the engine is
`element.editor`, the settings are properties, and the events are ordinary DOM
events. A plugin API that wrapped those again would be a second way to do the
same things.

So this adds only what was genuinely closed — putting a control in the action
cluster, and putting one in the inspector — and leaves everything else to the
API that already exists.

## The context

| Member | What it is |
| --- | --- |
| `element` | The custom element the plugin is attached to |
| `editor` | The `@pixen/core` engine behind it: commands, history, export |
| `strings` | The active locale's strings, so a plugin can match the interface |
| `addAction(action)` | A button beside undo, redo and export. Returns a remover |
| `addInspectorSection(section)` | Controls in the inspector. Returns a remover |
| `addStrings(locales)` | The plugin's own translations. Returns the reader for them |

### `addAction`

```ts
{
  id: string;                       // unique; adding the same id twice replaces
  label: string;                    // accessible name and tooltip
  icon?: IconName;                  // one of Pixen's own icons
  text?: string;                    // shown on the button; omit for icon-only
  emphasis?: "normal" | "primary";  // primary reads as the main action
  onClick(): void;
  disabled?(): boolean;             // asked on every refresh
}
```

Plugin actions are placed after Export, so a host's own button never displaces
the one people are looking for.

### `addInspectorSection`

```ts
{
  id: string;
  when?(): boolean;   // asked on every rebuild; absent means always
  build(): Node[];    // called on every rebuild, so it may read live state
}
```

Sections appear after the active tool's own controls and before the view
controls: after what the tool needs, before what the viewport needs. `build`
returns DOM nodes — plugins are first-party code, so what they build is trusted
the way the host's own code is.

### `addStrings`

A plugin shipped as its own package has labels of its own, and two bad options
without this: ship English to everybody, or paste its strings into the editor's
table, where a key collision is one release away.

```ts
const text = context.addStrings({
  en: { start: "Start", end: "End" },   // required: the fallback for everything else
  ko: { start: "시작", end: "끝" },
  ja: { start: "開始" },                 // partial is fine — see below
});

text("start");   // "시작" when the element is on `ko` or `ko-KR`
```

The keys are the plugin's own, so two plugins cannot collide with each other or
with Pixen. The reader looks the locale up each time it is called, so a plugin
that registered once still follows the element when the language changes; a tag
matches its base language the way the editor's own strings do; a language the
plugin does not carry falls back to `en` **per key**, not per table; and a key
with no translation anywhere reads as the key, so a developer can search for it.

`@pixen/video`'s trim strip is the first customer, and the reason this exists.

## Lifecycle

`use()` calls the plugin immediately and remembers the teardown. Every teardown
runs when the element is disconnected, and one that throws does not stop the
others: this is cleanup, and half-cleanup is worse than the error.

A plugin that adds and removes controls as state changes can call the removers
itself; removing something twice is a no-op.

## Shape rules

`editor.shapeProcessors` is a chain each layer goes through on its way to being
drawn. A rule returns `undefined` to pass, or the layers to draw in its place —
none, itself, or several.

```ts
editor.shapeProcessors.push((layer, { preview }) =>
  layer.type === "text" && layer.name === "draft" && !preview ? [] : undefined,
);
```

It is not a render hook: a rule never sees a canvas and cannot draw. It is a
rule *about shapes* — snap this rectangle to a grid, give every layer carrying a
marker the house style, expand one annotation into a callout of three, keep a
placeholder on screen and out of the file.

Two things make it safe to hand out. It runs over a copy on the way to the
renderer, so the stored document is untouched and undo still means what it said.
And it is told whether this is the preview or the file, because "not in the
export" and "not on screen" are both things a host wants to say.

The chain runs each rule over what the last one produced, not all of them over
the original — otherwise two rules matching the same shape would double it.

## What is deliberately not here

- **Custom tools and gestures.** A tool is a rail button, an inspector, a
  pointer state machine and a set of intents. Exposing that as API before the
  internal shape has settled would freeze it too early.
- **Custom layer types.** The document schema is a stored contract with a
  migration path; a plugin adding a layer type would produce documents Pixen
  itself could not read back.
- **Render hooks.** A shape rule is not one — it decides what to draw, never how.
  The scene is a draw list precisely so a different renderer
  can execute it later. Letting plugins draw into the Canvas2D executor would
  make that change breaking.

Each of these is a real request, and each is waiting on the layer beneath it
being stable enough to promise.
