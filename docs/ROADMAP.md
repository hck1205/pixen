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
- [ ] Free-angle straightening UI (the engine already accepts any rotation)
- [ ] Layer selection handles for resize and rotate
- [ ] Text editing directly on the canvas rather than in the inspector

## Phase 2 — commercial V1

- [ ] Device QA: iOS Safari, Android Chrome, Safari desktop
- [ ] Memory ceilings and preview downscale tuning on real large images
- [ ] Worker-based decode and encode behind the existing API
- [ ] Visual regression suite with golden images over fixture files
- [ ] Localisation beyond `en` / `ko`, RTL layout check
- [ ] Accessibility pass: focus order, roles, announcements, reduced motion
- [ ] Documentation site and hosted playground
- [ ] Licensing and distribution

## Phase 3 — Pro

- [ ] Filters and presets beyond brightness / contrast / saturation
- [ ] Blur and pixelate redaction modes (solid mask ships today)
- [ ] Watermarks: text, image, tiling, opacity
- [ ] Vue and Svelte wrappers
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
