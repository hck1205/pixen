# Pre-release legal checklist

Working notes for the maintainers, not legal advice. A lawyer should review
trademark, patent and open-source questions before a commercial release.

## Independence audit — 2026-08-18

Scope: every git-tracked file (85 files, ~7,800 lines of TypeScript), plus all
package manifests and the dependency graph.

**Result: clean.** What was checked and what changed:

| Check | Result |
| --- | --- |
| Third-party product / library names in source, docs, tests, assets | None. One descriptive use of a raster-editor brand name in the roadmap's out-of-scope list was rewritten in neutral terms |
| Third-party runtime dependencies in published packages | None. `@pixen/core` has zero dependencies; `@pixen/web` and `@pixen/react` depend only on `@pixen/*`, with `react` as a peer the host already provides |
| Vendored directories, committed minified bundles | None |
| Foreign copyright / SPDX headers inside first-party source | None. The only copyright notice in the repository is our own `LICENSE.md` |
| Colour and token values borrowed from third-party design systems | Two defaults matched well-known design-system reds. Replaced with a palette authored for this project (`model/palette.ts`), which also removed a real inconsistency between the core and UI defaults |
| Attribution of algorithm sources | Recorded per module in [PROVENANCE.md](PROVENANCE.md). One incorrect attribution in a code comment (luminance coefficients credited to the wrong standard) was corrected to the W3C Filter Effects specification they actually come from |
| Package name availability on npm | `pixen`, `@pixen/core`, `@pixen/web`, `@pixen/react` are all unregistered as of the audit date. Availability is not trademark clearance |

The audit is now automated: `scripts/independence-scan.mjs` runs as part of
`pnpm test` and in CI, and fails the build on any of the first four rows above.

## Independent implementation

- [x] No third-party image editor, editing library or graphics toolkit was read,
      decompiled, beautified or used as a reference. Sources are recorded per
      module in [PROVENANCE.md](PROVENANCE.md): web platform specifications, the
      Exif / TIFF format specification, the W3C Filter Effects specification, and
      first principles.
- [x] No third-party proprietary source was supplied to an AI tool as input, and
      no prompt asked for another product to be reproduced or matched.
- [x] Icons, styles, colour palette, strings and documentation are original to
      this repository.
- [x] The UI language is our own: a floating tool rail, a contextual inspector
      docked to the canvas, corner-bracket crop chrome.
- [x] Enforced continuously by the independence scan, not just at review time.
- [ ] Trademark search for the product name and domain, in the target markets.
- [ ] Decide whether a freedom-to-operate patent review is warranted. Note that
      independent implementation does not by itself clear patent risk.

## Dependencies

- [x] Published packages have zero third-party runtime dependencies.
- [x] Build and test tooling is MIT / Apache-2.0, recorded in
      [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).
- [x] Dependency policy is written down and enforced in CI
      ([CONTRIBUTING.md](../CONTRIBUTING.md#dependency-policy)).
- [ ] Add an automated licence scan and SBOM generation to CI before release.
- [ ] Re-check for copyleft (GPL / AGPL / SSPL) dependencies on every release.

## Claims

- [ ] No performance number is published without a reproducible benchmark and a
      published fixture set.
- [x] Redaction is described as removing pixels from the export, with its limits
      stated explicitly (see [SECURITY.md](SECURITY.md)).
- [x] The privacy statement matches actual behaviour: no telemetry, no network
      calls beyond a URL the host passes in.
- [x] No marketing or documentation copy positions this product by comparison to
      another one.
- [ ] Licence terms cover OEM, redistribution and enterprise use explicitly.
