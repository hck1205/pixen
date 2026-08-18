# Provenance

Pixen is an independent implementation. This file records, module by module,
what each non-obvious piece of the codebase is derived from, so the claim can be
checked rather than taken on faith.

Last audited: 2026-08-18 · scope: every git-tracked file in this repository.

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
| `geometry/crop.ts` | Handle-drag resize with edge anchoring and ratio locking | First principles: pin the opposite edge, solve the free axis from the locked ratio |
| `model/*` | `EditorDocument` schema, layers, validation, migrations | Original design for this project |
| `model/palette.ts` | Annotation colours and default ratios | Chosen for this project; not taken from any design system |
| `engine/commands.ts` | Pure document transforms, crop remapping across a rotate | First principles, using the matrices above |
| `engine/history.ts` | Snapshot undo with explicit transactions | Ordinary software design; undo-as-snapshot and command grouping are textbook concepts, not anyone's implementation |
| `image/exif.ts` | JPEG APP1 / TIFF IFD orientation parsing | The Exif and TIFF 6.0 specifications: `FFD8` SOI, `FFE1` APP1, the `Exif\0\0` header, `II`/`MM` byte order, magic `0x002A`, IFD entry layout, orientation tag `0x0112`. Written from the specified byte layout |
| `image/canvas.ts`, `image/encode.ts` | Surface allocation, encoding, byte budgets | MDN/WHATWG: `OffscreenCanvas.convertToBlob`, `HTMLCanvasElement.toBlob`. The quality-reduction loop is our own |
| `image/decode.ts` | Decode from blob/URL/bitmap, EXIF normalisation | MDN/WHATWG: `createImageBitmap`, `fetch`, `HTMLImageElement` |
| `image/resize.ts` | Step-down (halving) downscale | Standard sampling practice: decimating in one step drops the pixels between samples, so halve first. General technique, no library involved |
| `render/scene.ts` | Document → draw list projection | Original design for this project |
| `render/adjustments.ts` | Brightness / contrast / saturation, plus a pixel fallback | W3C **Filter Effects Module Level 1**: the `brightness()`, `contrast()` and `saturate()` definitions, and the luminance coefficients `0.213 / 0.715 / 0.072` from the `saturate` colour matrix in that specification |
| `render/canvas2d.ts` | Shape, arrow, path and text drawing | Canvas2D API; greedy line breaking; quadratic midpoint smoothing for free-draw; arrowheads from trigonometry |
| `export/*` | Full-resolution export, headless processing, policies | Original design for this project |
| `web/element.ts`, `web/viewport.ts` | Custom element, viewport, gesture handling | Web Components, Pointer Events and Resize Observer as specified by WHATWG/W3C. Layout, interaction model and chrome are original |
| `web/icons.ts` | Icon set | Drawn for this project as single-weight stroked primitives on a 24×24 grid |
| `web/styles.ts` | Theme tokens and layout | Written for this project |
| `react/index.tsx` | Props → properties, events → callbacks | React documentation on custom elements and `useImperativeHandle` |

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
