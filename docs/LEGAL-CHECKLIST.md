# Pre-release legal checklist

Working notes for the maintainers, not legal advice. A lawyer should review
trademark, patent and open-source questions before a commercial release.

## Independent implementation

- [x] No competitor source code, bundled or minified, was read, decompiled or
      used as a reference. The implementation is derived from web platform
      documentation (Canvas2D, `createImageBitmap`, pointer events), the TIFF /
      EXIF specification, and standard image-processing technique.
- [x] No competitor code was supplied to an AI tool as input.
- [x] Icons, styles, strings and documentation are original to this repository.
- [x] The UI language is our own: a floating tool rail, a contextual inspector
      docked to the canvas, corner-bracket crop chrome.
- [ ] Trademark search for the product name and domain.
- [ ] Decide whether a freedom-to-operate patent review is warranted for the
      target markets.

## Dependencies

- [x] Runtime dependencies: none. The published packages depend only on each
      other. See [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).
- [x] Build and test tooling is MIT / Apache-2.0.
- [ ] Add an automated licence scan and SBOM generation to CI before release.
- [ ] Re-check for copyleft (GPL / AGPL / SSPL) dependencies on every release.

## Claims

- [ ] No performance number is published without a reproducible benchmark and a
      published fixture set.
- [x] Redaction is described as removing pixels from the export, with its limits
      stated explicitly (see [SECURITY.md](SECURITY.md)).
- [x] The privacy statement matches actual behaviour: no telemetry, no network
      calls beyond a URL the host passes in.
- [ ] Licence terms cover OEM, redistribution and enterprise use explicitly.
