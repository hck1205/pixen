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
- [ ] Text editing directly on the canvas rather than in the inspector

## Phase 2 — commercial V1

- [ ] Device QA: iOS Safari, Android Chrome, Safari desktop
- [ ] Memory ceilings and preview downscale tuning on real large images
- [ ] Worker-based decode and encode behind the existing API
- [x] Story browser covering every UI state, for visual review
- [ ] Visual regression suite with golden images over the stories
- [ ] Localisation beyond `en` / `ko`, RTL layout check
- [ ] Accessibility pass: focus order, roles, announcements, reduced motion
- [ ] Documentation site and hosted playground
- [ ] Licensing and distribution

## Phase 3 — Pro

- [x] Filters and presets beyond brightness / contrast / saturation
      (exposure, hue, grayscale, sepia, invert, vignette, nine presets)
- [ ] Adjustments needing a per-pixel pass — gamma, white balance — which wait
      for a GPU renderer
- [x] Blur and pixelate redaction modes
- [x] Image watermarks: corner, edge, centre or tiled, with opacity
- [x] Text watermarks (a text layer plus the same placement maths)
- [x] Frames: solid, inset and rounded, drawn over the finished picture
- [x] Vue wrapper (`@pixen/vue`)
- [ ] Svelte and Angular wrappers (both usable today through the element; see
      [FRAMEWORKS.md](FRAMEWORKS.md))
- [ ] Public plugin API with a documented extension surface

## Phase 4 — differentiation

- [ ] Batch processing UI on top of `processImages`
- [ ] AI provider adapters (customer backend or their own key; Pixen runs no
      models and holds no keys)
- [ ] Smart crop, background removal, upscale via those adapters
- [ ] Enterprise policy engine: shared, versioned output rules

## Deliberately out of scope for now

Video editing, generative fill, a full multi-layer compositing system, camera
raw and layered-source formats, advanced typography, real-time collaboration,
WebGPU, and native mobile SDKs. Each is a product of its own, and none of them
is what makes the first release useful.
