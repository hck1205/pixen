# Contributing

## The one rule that is not negotiable

**Write it, don't fetch it.** Pixen is an independent implementation, and every
contribution has to keep it that way.

Do not:

- copy code from another image editor, editing library or graphics toolkit —
  proprietary or open source;
- read, decompile, beautify or step through a competitor's bundle "just to see
  how they did it";
- paste code from a source you cannot name and license, including answers from
  Q&A sites and blog posts;
- feed third-party proprietary source into an AI tool, or ask one to reproduce,
  clone or match another product.

Do:

- work from specifications and platform documentation — WHATWG, W3C, MDN, and
  published file-format specs;
- record the basis for anything non-obvious in [docs/PROVENANCE.md](docs/PROVENANCE.md);
- describe *behaviour we want* in issues and commits, never *how another product
  does it*.

## Dependency policy

Published packages (`@pixen/core`, `@pixen/web`, `@pixen/react`) ship **zero
third-party runtime dependencies**, and CI enforces it.

Adding one is a deliberate decision that needs, in the pull request:

1. why it cannot reasonably be written here;
2. its licence (MIT, BSD or Apache-2.0 — anything copyleft or source-available
   needs review before it goes anywhere near a published package);
3. an entry in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Development and test tooling is not subject to the zero-dependency rule, but its
licences are still recorded.

## AI-assisted contributions

Using AI to write code is fine, and expected. The policy in
[docs/PROVENANCE.md](docs/PROVENANCE.md#ai-assisted-development) applies: no
third-party proprietary source as input, no "make it like X" prompts, and human
review before commit.

## Before you open a pull request

```bash
pnpm build              # typecheck and build all packages
pnpm test               # unit tests, including the independence scan
pnpm test:browser       # Playwright against the built playground
pnpm check:independence # the scan on its own, with readable output
```

## Coding notes

- The engine is the single source of truth. UI layers observe it; they never
  keep a second copy of the document.
- Document state is JSON. Anything with a lifetime (bitmaps, blobs, textures)
  belongs in the `ResourceManager`, keyed by id.
- Any gesture that produces more than one state change is wrapped in an editor
  transaction, so it undoes as one step.
- Coordinate conversions go through `geometry/spaces.ts`. Never hand-roll one at
  a call site.
- Changing the document schema means a version bump and a migration, in the same
  pull request.
