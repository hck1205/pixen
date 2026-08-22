# The editor document

`EditorDocument` is the serialised contract. The moment a customer writes one to
a database it becomes public API, so it ships versioned, validated and
migratable from v1.

```jsonc
{
  "schemaVersion": 5,
  "source": { "resourceId": "res_1a2b", "width": 4000, "height": 3000, "name": "beach.jpg", "mimeType": "image/jpeg" },
                                                                     // "duration": 12.5 as well, for a source that runs
  "transform": { "rotation": 0, "flipX": false, "flipY": false },   // radians, clockwise
  "crop": { "x": 0, "y": 0, "width": 4000, "height": 3000 },        // stage space, or null
  "clip": null,                                                      // { "start": 2, "end": 7 } in seconds, or null
  "aspectRatio": 1.7777777777777777,                                 // locked ratio, or null
  "adjustments": { "exposure": 0, "brightness": 0, "contrast": 0, "saturation": 0,
                   "hue": 0, "grayscale": 0, "sepia": 0, "invert": 0, "vignette": 0 },
  "layers": [],                                                      // image space
  "output": { "width": null, "height": null, "format": null, "quality": null, "background": null, "upscale": false },
  "meta": {}                                                         // host data, round-tripped untouched
}
```

## Rules

- **No pixels, ever.** The document references an image by `source.resourceId`;
  the bytes live in the `ResourceManager`. That is what makes documents small,
  JSON-safe, diffable and cheap to snapshot for undo.
- **Resource ids are per-session.** They do not survive a reload, so restoring a
  document takes the image separately:
  `await editor.restore(saved, file)`. Restoring with an unknown id and no image
  throws `RESOURCE_MISSING` rather than guessing.
- **`meta` is yours.** Pixen never reads it and always round-trips it.
- **Layer geometry is image space.** Rotating or flipping the image does not
  rewrite a single layer coordinate.
- **A clip is to time what a crop is to space**, and is stored the same way: an
  absolute range in seconds against a source that states its own `duration`, not
  a pair of fractions. `[0.5, 0.7]` of a source whose length you have not got is
  not a range, and the moment the picture underneath is replaced by one of a
  different length it silently means something else. `null` is the whole of it,
  which is what a photograph always has.

## Layers

| type | geometry | notes |
| --- | --- | --- |
| `rect` | `frame` | optional `stroke`, `fill`, `cornerRadius` — a filled rect is also the redaction mask |
| `ellipse` | `frame` | inscribed in the frame |
| `line` | `from`, `to` | `arrowStart` / `arrowEnd` draw heads |
| `path` | `points[]` | free draw, midpoint-smoothed at render time |
| `text` | `position` | `fontSize`, `fontFamily`, `align`, optional `maxWidth` wrapping |
| `image` | `frame` | A bitmap by `resourceId` — a sticker, a logo, a watermark. `repeat` tiles it |
| `redact` | `frame` | `mode` (`solid` / `blur` / `pixelate`), `strength`, and the `colour` used by `solid` and as the fallback |

Every layer carries `id`, `visible`, `locked`, `opacity` and its own `rotation`.

An `image` layer holds no pixels either: like the source, it references the
`ResourceManager` by id, so a document with ten stickers is still small JSON and
the same bitmap placed twice is decoded once. A layer whose resource is missing
renders as nothing rather than as an error — a saved document can outlive the
sticker it referenced.

## Adjustments

Nine values, every one of them neutral at `0`.

| Field | Range | Meaning |
| --- | --- | --- |
| `exposure` | -2 .. 2 | Photographic stops: one stop is a doubling, so it multiplies where `brightness` shifts |
| `brightness` | -1 .. 1 | Linear lift |
| `contrast` | -1 .. 1 | Around mid grey |
| `saturation` | -1 .. 1 | -1 is fully desaturated |
| `hue` | -180 .. 180 | Degrees of rotation |
| `grayscale` | 0 .. 1 | Amount |
| `sepia` | 0 .. 1 | Amount |
| `invert` | 0 .. 1 | Amount |
| `vignette` | 0 .. 1 | Corner fall-off |

The first eight become one CSS filter chain that the browser applies to the
preview and the export through the same code path; where `ctx.filter` is
missing, a pixel pass reproduces the same chain in the same order (filters do
not commute, so the order is part of the contract). The vignette is drawn as a
radial gradient instead, because no filter function shades by position.

That boundary is deliberate: an adjustment the platform cannot express as a
filter — a gamma curve, a white-balance shift — would need a pass over every
pixel on every frame, which a slider drag on a large image cannot afford. Those
wait for a renderer that can do them on the GPU.

Presets are not a separate concept. Applying one writes these same fields, so it
is one undo step, serialises as ordinary adjustments, and can be nudged
afterwards rather than being a mode to leave.

## Frames

`frame` is `null`, or a border drawn over the finished picture:

| Field | Meaning |
| --- | --- |
| `style` | `solid` on the edge, `inset` standing off it, or `rounded` |
| `width` | Line thickness as a fraction of the picture's longest edge |
| `colour` | Any CSS colour |
| `radius` | Corner radius as a fraction of the longest edge; `rounded` only |
| `inset` | Distance from the edge as a fraction of the longest edge; `inset` only |

Document-level rather than a layer, because a frame is not something you select
and drag — and keeping it out of `layers` means it cannot be reordered under an
annotation. Everything is a fraction so one setting suits a thumbnail and a
6000px export alike; the renderer resolves them against the picture it is
drawing, which is why a frame in the viewport hugs the image rather than the
canvas the image floats in.

## Versioning

`migrateDocument` walks a raw document from its stored version to the current
one, applying each registered step in order:

```js
import { registerMigration } from "@pixen/core";

registerMigration(6, (document) => ({ ...document, /* v6 -> v7 changes */ }));
```

Shipped so far:

| Step | What changed |
| --- | --- |
| v1 → v2 | Added the `image` and `redact` layer types. Nothing in a v1 document changes, but the version moves so that a v1 build refuses a v2 document rather than dropping a redaction it cannot render |
| v2 → v3 | Widened `adjustments` from three values to nine. The new ones are filled in neutral, so a v2 document looks exactly as it did |
| v3 → v4 | Added the optional `frame`. A v3 document had none, and `null` is exactly that |
| v4 → v5 | Added the optional `clip`, and `duration` on the source. A v4 document is a still picture, and `null` is exactly "all of it" |
| v5 → v6 | Added `output.upscale`, and let `output.quality` be unset. A v5 document exported through the panel *did* enlarge past its source, so `true` would preserve what it did — `false` is chosen anyway, because the panel and the batch call disagreed and only one of them can be right. The quality is left exactly as found: turning an explicit number into "unset" would re-encode somebody's archive at a different size the next time it was opened |

- A document from a **newer** build fails with `UNSUPPORTED_SCHEMA_VERSION`
  rather than being partially understood.
- A missing migration step fails loudly for the same reason.
- Validation (`parseDocument`) runs after migration and reports the exact JSON
  path that was wrong: `Invalid document at "$.source.width": expected a finite
  number`.

Support policy: migrations for released schema versions are kept indefinitely.
Removing one is a breaking change and will only happen in a major release.
