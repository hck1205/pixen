# Pixen — working agreement

A browser image editing SDK: crop, rotate, annotate, resize and re-encode on the
client, with trimming and video export as a separate package. Read this before
changing anything; it is the short version of the rules the rest of the
documentation explains.

## Packages

| Package | What it is | Depends on |
| --- | --- | --- |
| `@pixen/core` | The engine: document model, geometry, history, renderer, export | nothing |
| `@pixen/web` | `<pixen-image-editor>`, the framework-agnostic UI | core |
| `@pixen/react` | React bindings | core, web |
| `@pixen/vue` | Vue 3 bindings | core, web |
| `@pixen/svelte` | Svelte bindings, as an action | core, web |
| `@pixen/video` | Trimming, the trim strip, and video export, sold separately | core (types only from web, for the plugin) |

`apps/playground` is the demo and the browser-test fixture — two pages, one for
stills and one for video. `apps/stories` is the Ladle story browser — the visual
reference for the UI.

## Non-negotiables

1. **Independent implementation.** No competitor's code, bundle, documentation or
   UI is ever a reference. Derive from web platform specifications and first
   principles, and record anything non-obvious in `docs/PROVENANCE.md`.
   `pnpm check:independence` enforces the mechanical part.
2. **Zero third-party runtime dependencies** in published packages. Adding one is
   a deliberate decision with a written justification — see `CONTRIBUTING.md`.
3. **The engine is the single source of truth.** UI layers observe it. Nothing
   above the engine keeps a second copy of the document.
4. **Document state is JSON.** Anything with a lifetime — bitmaps, blobs,
   textures — belongs to the `ResourceManager`, keyed by id.
5. **Schema changes ship with a migration**, in the same change.

## Refactor continuously

Refactoring is part of every change, not a separate task. Leave each file better
than you found it, and act on these the moment you notice them:

- **Name every literal.** A number or string with meaning becomes a named
  constant next to the thing it configures — `element/sliders.ts`,
  `model/defaults.ts`, `geometry/crop.ts`. If the same value appears twice, it
  had one home all along; find it and import from there.
- **One concern per module.** When a file starts answering two questions, split
  it. Names describe the concern, not the type: `chrome/inspector/crop.ts`, not
  `helpers.ts` or `utils.ts`.
- **Folders nest by concern, repeatedly.** `element/chrome/inspector/`,
  `render/ops/`, `render/canvas2d/` and `engine/session/` are the pattern: as a
  concern grows its own parts, it becomes a folder with a barrel `index.ts`, and
  the same rule applies inside it.
- **Extract the decision, keep the effect thin.** Anything that decides — what a
  keystroke means, which inspector section to show, how a gesture maps to an
  intent — is a pure function over data, and gets a unit test. Classes hold
  state, effects and subscribers; nothing else.
- **Commonise the third occurrence.** Two similar pieces of code can wait; three
  is a shared module. Do not abstract on the first.
- **Delete rather than deprecate.** Pre-1.0, an unused export is dead weight.
  `pnpm check:exports` fails on one, so this is a check rather than an intention;
  a genuine host-facing seam goes in that script's short allowlist with a reason.

Some of this is enforced mechanically; the rest is read for:

| Check | Enforces |
| --- | --- |
| `pnpm check:exports` | Delete rather than deprecate |
| `pnpm check:duplication` | Commonise the third occurrence |
| `pnpm check:size` | A file past 300 lines is split, or its reason is written down, and an exemption ratchets down as the file shrinks |
| `pnpm check:surface` | Every `@pixen/*` export is recorded in `docs/PUBLIC-API.md`, so adding one is a reviewed line rather than a side effect of a barrel |
| `pnpm check:paths` | Every file the documentation names is still there — a module that grew into a folder leaves the prose pointing nowhere |

The checks are a floor, not the standard. They cannot see a file answering two
questions, a decision buried in an effect, or a literal that wants a name — so
a refactor pass still means reading. What they buy is that the mistakes a
person makes twice, a machine now makes never.

Two rules the size budget is *not*: it is not a cap, and length is not a smell
on its own. A long file that is one concern — a facade of one-line delegations,
a table of data — stays long and says why in `scripts/module-budget.mjs`. But
an exemption is pinned to the size it was written at, so it cannot become a
licence to keep growing — and when a split makes the file smaller, the pin is
asked to come down with it, so the slack is not banked as future headroom.

The public API is the exception: `@pixen/*` exports, custom element attributes,
`part` names and slot names are contracts. Changing one is a decision, not
cleanup — and `docs/PUBLIC-API.md` is the record, so it has to be a visible one.
A barrel that says `export *` is how that decision gets made by accident; name
what a package-level barrel re-exports.

## Architecture in one screen

```
Application → framework wrapper → <pixen-image-editor> → Viewport → Editor
                                                                      │
                          commands · history · session (all pure) ────┤
                                                                      │
                      EditorDocument (JSON) + ResourceManager (bitmaps)
                                                                      │
                                        scene → draw ops → Canvas2D / export
```

- Coordinates live in four spaces — image, stage, output, view — and every
  conversion goes through `geometry/spaces.ts`. Never hand-roll one.
- State changes go through `editor.dispatch(intent)`. Intents are data.
- Any gesture producing more than one state change is wrapped in a transaction,
  so it undoes as one step.

## Checks before a commit

```bash
pnpm build              # typecheck and build every package
pnpm test               # unit tests, including every scan above
pnpm test:browser       # Playwright against the built playground
pnpm stories            # visual review; UI changes need a story
```

UI changes need a story. Engine changes need a unit test on the pure function
that made the decision. Layout changes need a browser assertion — the layout bugs
this project has actually shipped were invisible to unit tests.

## Where to read more

`docs/TESTING.md` (the four suites) · `docs/ARCHITECTURE.md` (layers and coordinate model) · `docs/PUBLIC-API.md`
(every exported name) · `docs/DOCUMENT-SCHEMA.md`
(the stored contract) · `docs/BROWSER-SUPPORT.md` (what degrades where) ·
`docs/VIDEO.md` (the separate package, and its two large costs) ·
`docs/FRAMEWORKS.md` (integration) · `docs/PLUGINS.md` (extension surface) · `docs/SECURITY.md` · `docs/PROVENANCE.md` ·
`CONTRIBUTING.md`.
