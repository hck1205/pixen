# Provenance

Pixen is an independent implementation. This file records, module by module,
what each non-obvious piece of the codebase is derived from, so the claim can be
checked rather than taken on faith.

Last audited: 2026-08-19 · scope: every git-tracked file in this repository.

## Method

Every module was written from one of three sources:

1. **Web platform documentation** — the WHATWG HTML standard, the W3C specs
   named below, and MDN reference pages for the APIs involved.
2. **Published file-format specifications** — for the one binary format Pixen
   parses itself.
3. **First principles** — linear algebra, trigonometry, and ordinary software
   design.

No third-party image editor, editing library or graphics toolkit was read,
decompiled, beautified, disassembled or consulted as a reference — neither its
source, nor its bundle, nor its documentation prose, nor its UI. No such code
was supplied to an AI tool as input at any point.

## Module by module

| Module | What it implements | Derived from |
| --- | --- | --- |
| `geometry/matrix.ts` | 2D affine matrices: multiply, invert, apply | Linear algebra. The `{a,b,c,d,e,f}` field layout is the argument order of `CanvasRenderingContext2D.setTransform`, i.e. the platform's own contract |
| `geometry/rect.ts` | Rectangle algebra, aspect fitting, rotated bounds | First principles; rotated bounding box is `w·|cos| + h·|sin|` |
| `geometry/spaces.ts` | The image / stage / output / view coordinate model | Original design for this project |
| `geometry/straighten.ts` | Free rotation, and the largest crop that is still all image | First principles: a centred rectangle fits a rotated one when its half-extents, projected onto the rotated axes, stay inside — two inequalities rather than a search |
| `geometry/crop.ts` | Handle-drag resize with edge anchoring and ratio locking | First principles: pin the opposite edge, solve the free axis from the locked ratio |
| `model/transform.ts` | Resizing and rotating a layer about its own centre | First principles: take the pointer into the layer's unrotated frame, pin the opposite corner, then correct for the drift rotation puts in the centre |
| `model/*` | `EditorDocument` schema, layers, migrations | Original design for this project |
| `model/validate.ts` | Composable validators accumulating every issue | Ordinary parser-combinator technique; the shapes validated are our own schema |
| `fp/*` | `Result`, `pipe`, immutable array helpers | Standard functional idioms, written here in a few dozen lines rather than taken from a library |
| `model/palette.ts` | Annotation colours and default ratios | Chosen for this project; not taken from any design system |
| `engine/commands.ts` | Pure document transforms, crop remapping across a rotate | First principles, using the matrices above |
| `engine/history.ts` | Snapshot undo with explicit transactions, as immutable state | Ordinary software design; undo-as-snapshot and command grouping are textbook concepts, not anyone's implementation |
| `engine/session/` | The intent vocabulary and the reducer over document, selection and history | Original design for this project; the reducer shape is a common functional idiom |
| `image/exif.ts` | JPEG APP1 / TIFF IFD orientation parsing | The Exif and TIFF 6.0 specifications: `FFD8` SOI, `FFE1` APP1, the `Exif\0\0` header, `II`/`MM` byte order, magic `0x002A`, IFD entry layout, orientation tag `0x0112`. Written from the specified byte layout |
| `image/worker/*` | Decode and encode on a worker thread | MDN/WHATWG: `Worker`, `postMessage` transferables, `OffscreenCanvas.convertToBlob`. Shipping the body as a serialised function in a blob URL is our own choice, for the reason recorded in the module |
| `image/canvas.ts`, `image/encode.ts` | Surface allocation, encoding, byte budgets | MDN/WHATWG: `OffscreenCanvas.convertToBlob`, `HTMLCanvasElement.toBlob`. The quality-reduction loop is our own |
| `image/decode.ts` | Decode from blob/URL/bitmap, EXIF normalisation, byte counting while fetching | MDN/WHATWG: `createImageBitmap`, `fetch`, `HTMLImageElement`; the byte count reads `Content-Length` (RFC 9110) and drains `Response.body` through the Streams `ReadableStreamDefaultReader` |
| `render/scramble.ts` | Seeded shuffling of a mosaic | Fisher–Yates and an xorshift integer generator, both textbook algorithms written out from their definitions; FNV-1a for the seed. Deriving the seed from the layer id, so a preview and an export agree, is our own choice |
| `export/mask.ts` | The marked areas as a mask image | Original design for this project: the draw-op list is recoloured rather than the geometry re-derived, which is only possible because ops are data |
| `export/upload.ts` | Multipart delivery with upload progress | MDN/WHATWG: `XMLHttpRequest`, `XMLHttpRequestUpload` and `FormData`. XHR rather than `fetch` because only it reports request-body progress; `ProgressEvent.lengthComputable` is the platform's own name for "there is no total" |
| `export/hooks.ts` | Host steps inside an export | Original design for this project. Passing a canvas rather than a pixel array is our own choice, for the reason recorded in the module |
| `engine/tasks/` | Start, progress, cancel and end of a long-running task | Original design for this project. `AbortController`/`AbortSignal` are the platform's own cancellation contract; `loaded`/`total`/"length computable" mirrors the vocabulary of the DOM `ProgressEvent` interface, which is a specification rather than anyone's code |
| `image/resize.ts` | Step-down (halving) downscale | Standard sampling practice: decimating in one step drops the pixels between samples, so halve first. General technique, no library involved |
| `render/scene.ts` | Document → draw list projection | Original design for this project |
| `render/presets.ts` | Nine named looks | Values chosen here by eye against this project's own sample image |
| `render/canvas2d/decoration.ts` | Vignette and frame | A radial gradient fill and a stroked rectangle; first principles |
| `render/adjustments.ts` | The adjustment chain, plus a pixel fallback | W3C **Filter Effects Module Level 1**: the `brightness()`, `contrast()` and `saturate()` definitions, and the luminance coefficients `0.213 / 0.715 / 0.072` from the `saturate` colour matrix, the `sepia` colour matrix, and the luminance-preserving `hue-rotate` matrix, all written out from that specification |
| `render/ops/` | Scene to draw-operation list: paths, arrow heads, text layout | Greedy line breaking; quadratic midpoint smoothing for free-draw; arrow heads from trigonometry |
| `render/canvas2d/` | Executes a draw-operation list | Canvas2D API. Redaction: `ctx.filter = blur(...)` is the W3C **Filter Effects Module Level 1** `blur()` function as exposed on the canvas context; pixelation is a downscale-then-upscale with `imageSmoothingEnabled = false`, which is what nearest-neighbour resampling means |
| `export/placement.ts` | Placing a watermark in one of nine positions, and a sticker in the middle of the crop | First principles: a fraction of the longest edge, inset by a margin; the crop brought back through `stageToImage` before anything is placed in it |
| `export/*` | Full-resolution export, headless processing, policies | Original design for this project |
| `model/defaults.ts` | The quality each encoder is asked for | Measured here, not adopted. Three pictures were encoded across the quality range in Chromium and compared to the source as root-mean-square error: a photograph (smooth sky, textured ground, hard-edged text, grain), a deliberately hard picture (fine noise, sharp text, saturated edges), and a nearly flat illustration. On the two where the error was visible at all, matching JPEG's error put WebP about 0.05–0.10 lower; on the flat one both stayed under an error of 1 across the whole range. Hence JPEG a little above the old single default and WebP a little below it. The method is in the module, and re-running it needs nothing but a browser |
| `web/viewport/gestures/*` | Pointer gestures as a state machine | Original design for this project |
| `video/source.ts` | Opening a moving source | MDN/WHATWG: `HTMLVideoElement`, `loadedmetadata`, `URL.createObjectURL`. That a video element is already a `CanvasImageSource` is the HTML specification's own list for `drawImage`, and adopting it as the editor's source rather than decoding frames is our own choice |
| `video/playback.ts` | Driving the playhead through a range | MDN/WHATWG: `HTMLVideoElement.currentTime`, the `seeked` and `ended` events, and `requestVideoFrameCallback` (W3C **HTMLVideoElement.requestVideoFrameCallback**), with `requestAnimationFrame` where it is absent |
| `video/encode.ts` | Recording a canvas to a file | MDN/WHATWG: `HTMLCanvasElement.captureStream` and the W3C **MediaStream Recording** specification. The codec preference order and the recorder seam are our own choices, both recorded in the module with the measurement behind them |
| `video/audio.ts` | Keeping the clip's sound | MDN/W3C: **Media Capture from DOM Elements** (`HTMLMediaElement.captureStream`) and the **Web Audio API** `GainNode`. Taking the track from the element's captured stream rather than from a media element source node is our own choice, so the host's element is not re-routed and a second export still works — measured, along with the fact that a muted element still captures a live audio track. That `0` drops the track rather than writing silence, and that the container then stops asking for Opus, are ours as well |
| `video/trim/strip.ts` | Marking a stretch, then keeping or cutting it | Ours. The interaction — two handles that mark rather than edit, and buttons that decide — is chosen because it makes several kept parts reachable with the control already there, and because a mark that costs an undo step every time it moves is not a mark. Built on `<input type=range>`, whose thumb behaviour is the platform's |
| `web/viewport/overlay.ts` | Crop chrome geometry | Rule-of-thirds guides and corner brackets, laid out here |
| `web/element/*`, `web/viewport/*` | Custom element, viewport, event plumbing | Web Components, Pointer Events and Resize Observer as specified by WHATWG/W3C. Layout, interaction model and chrome are original |
| `web/theme/icons.ts` | Icon set | Drawn for this project as single-weight stroked primitives on a 24×24 grid |
| `web/theme/styles.ts` | Theme tokens and layout | Written for this project |
| `web/i18n/*` | Strings in nine languages | Translated for this project from the English source strings, which were written here |
| `web/viewport/text-box.ts` | Placing a real input over a text layer | First principles: the same origin and line height the renderer uses |
| `web/tools/stickers.ts` | Normalising host-supplied sticker definitions | Original design for this project. Pixen ships no sticker artwork |
| `web/plugins/*` | The extension surface | Original design for this project; a setup function returning a teardown is an ordinary idiom |
| `react/index.tsx` | Props → properties, events → callbacks | React documentation on custom elements and `useImperativeHandle` |
| `svelte/index.ts` | The element as a Svelte action | The Svelte documentation on actions: a function returning `update` and `destroy` |

## What functional similarity does and does not mean

Any image editor will have a crop tool, a rotate button, a quality slider and an
export call, and those words will appear in any such product's API. That overlap
is functional vocabulary, not expression: it comes from the problem, not from
another codebase. What matters — and what this project keeps independent — is
the implementation, the architecture, the document format, the interaction
design, the visual design, the copy and the naming.

## AI-assisted development

This codebase was written with AI assistance under a fixed policy:

- No third-party proprietary source was ever provided as input.
- No request was framed as "reproduce", "clone" or "match" another product.
- Generated code is reviewed before it is committed; anything that arrives
  looking like a recognisable verbatim block from elsewhere is rejected and
  redesigned rather than edited.

## How this stays true

`scripts/independence-scan.mjs` runs on every test run and in CI. It fails the
build on:

- a third-party product or library name anywhere in the tracked tree;
- a third-party runtime dependency in a published package;
- vendored directories, committed minified bundles, or a foreign copyright /
  SPDX header inside first-party source.

Run it directly with `pnpm check:independence`.
