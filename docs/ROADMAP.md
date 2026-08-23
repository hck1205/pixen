# Roadmap

Sequenced so the parts that are expensive to change later — the coordinate
model, the document contract, resource lifecycle, undo semantics — are settled
before anything is built on top of them.

## Phase 0 — architecture proof · done

Document model, geometry and coordinate spaces, resource manager, Canvas2D
renderer, crop, history transactions, export, serialisation. Validated by 119
unit tests and a browser suite driving the real bundle.

## Phase 1 — MVP · in progress

- [x] Load from file, blob, URL, data URL, drag-and-drop, clipboard
- [x] Crop with aspect ratio locking, rotate, flip, zoom, pan, pinch
- [x] Resize and re-encode to JPEG / PNG / WebP with a byte budget
- [x] Undo, redo, reset, transactional gestures
- [x] Annotations: rectangle, ellipse, arrow, free draw, text, redaction
- [x] Document serialise / restore
- [x] Web component + React wrapper
- [x] Free-angle straightening UI, with an auto-fitting crop
- [x] Layer selection handles for resize and rotate
- [x] Text editing directly on the canvas rather than in the inspector

## Phase 2 — commercial V1

- [ ] Device QA: iOS Safari, Android Chrome, Safari desktop. The suite already
      runs against WebKit and Firefox with `PIXEN_BROWSERS=all`; what is missing
      is the hardware
- [ ] Memory ceilings and preview downscale tuning on real large images
- [x] Worker-based decode and encode behind the existing API
- [x] Story browser covering every UI state, for visual review
- [x] Visual regression suite with golden images over the stories ([TESTING.md](TESTING.md))
- [x] Localisation: nine locales, and an RTL layout that mirrors
- [x] Accessibility: roles, names, pressed state, announcements, reduced motion
- [ ] Documentation site and hosted playground
- [ ] Licensing and distribution

## Phase 3 — Pro

- [x] Filters and presets beyond brightness / contrast / saturation
      (exposure, hue, grayscale, sepia, invert, vignette, nine presets)
- [x] Adjustments needing a per-pixel pass — gamma, and white balance on both
      axes. A filter chain is a fixed set of functions and neither a gamma curve
      nor a channel gain is among them, so these cost a pass whatever engine is
      drawing; `adjustmentPlan` is what keeps the two engines agreeing
- [x] Blur and pixelate redaction modes
- [x] Image watermarks: corner, edge, centre or tiled, with opacity
- [x] Text watermarks (a text layer plus the same placement maths)
- [x] Frames: six treatments — solid, inset, rounded, corner hooks, parallel lines
      and floating edges — drawn over the finished picture
- [x] Vue wrapper (`@pixen/vue`)
- [x] Svelte bindings (`@pixen/svelte`): an action, with no Svelte dependency
- [ ] Angular: no package planned. The element binds with Angular's own property
      and event syntax once `CUSTOM_ELEMENTS_SCHEMA` is declared, and a wrapper
      would add an Angular toolchain to this repository to save one line — see
      [FRAMEWORKS.md](FRAMEWORKS.md)
- [x] Sticker tool over host-supplied artwork
- [x] Public plugin API with a documented extension surface ([PLUGINS.md](PLUGINS.md))

## Phase 4 — differentiation

- [x] Batch processing UI on top of `processImages`, in the playground
- [ ] AI provider adapters (customer backend or their own key; Pixen runs no
      models and holds no keys)
- [ ] Smart crop, background removal, upscale via those adapters
- [ ] Enterprise policy engine: shared, versioned output rules

## Phase 5 — video · started

Sold and shipped separately, as `@pixen/video`, because it is a different
product with different costs — not because the editor could not carry it. It
turned out that it could, and cheaply: an `HTMLVideoElement` is already a
drawable source, so a clip goes through the same scene as a photograph and the
crop, the straightening, the adjustments and every annotation reach each frame
without one of them learning that the picture moves.

- [x] A clip range in the document, stored the way a crop is — absolute seconds
      against a source that states its own duration ([DOCUMENT-SCHEMA.md](DOCUMENT-SCHEMA.md))
- [x] Open a moving source, and never proxy it into a preview bitmap
- [x] Export the trimmed clip, with a seam for a host's own encoder
- [x] Timeline UI for the trim handles, shipped as a plugin in the extension package
- [x] A plugin surface that can carry its own locale strings, which an extension
      shipped as a separate package needs — `addStrings`, whose first customer is
      the trim strip
- [x] The costs and the limits written down for someone deciding whether to buy
      it ([VIDEO.md](VIDEO.md))
- [x] Undo step names in the reader's own language: the engine names its steps,
      every shipped locale words them, and a host's own label is left as given

Two costs, both measured rather than assumed. Recording runs at wall-clock speed
— a thirty-second clip takes thirty seconds — because `MediaRecorder` samples a
canvas as it is painted. And it writes WebM. Measured in the
Chromium this repository tests against, VP8, VP9 and bare WebM are all accepted;
a bare `video/mp4` request is accepted as well, while an explicit H.264 one is
refused; and `VideoEncoder` is absent, so WebCodecs is what a host reaches for
through the encoder seam rather than something Pixen can depend on. That surface
differs by browser build — another Chromium on this same machine reports
`VideoEncoder` present — which is why the story browser asks the browser in front
of you instead of repeating a number measured somewhere else.

## Deliberately out of scope for now

Generative fill, a full multi-layer compositing system, camera raw and
layered-source formats, advanced typography, real-time collaboration, WebGPU,
and native mobile SDKs. Each is a product of its own, and none of them is what
makes the first release useful.

Video editing was on this list until it was not. What moved it was measuring the
cost rather than assuming it: trimming and re-encoding a clip needed one new
concept in the document and three files in a package of its own.
