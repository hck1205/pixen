# Security and privacy

## Input handling

- **SVG input is refused** (`UNSUPPORTED_FORMAT`). Rasterising untrusted SVG can
  execute embedded content, so it is not accepted until a sanitisation pipeline
  exists. This is a deliberate, documented limitation, not an oversight.
- **Decompression bombs** are bounded: `assertDrawableSize` rejects anything over
  268,435,456 pixels (16384 × 16384) with `MEMORY_LIMIT` before allocation.
- **Non-image and empty files** fail with `UNSUPPORTED_FORMAT` / `INVALID_IMAGE`
  rather than producing a blank canvas.
- **EXIF parsing** walks segment headers only, never trusts a length field far
  enough to read past the buffer, and returns "no orientation" for anything
  malformed. It is fed at most the first 256 KB of a file.
- **Cross-origin images** report `CORS_ERROR` with the URL. A tainted canvas
  cannot be read back, so the adjustment fallback degrades rather than throwing.
- **Text annotations** are drawn to canvas as text. Nothing user-supplied is ever
  inserted as HTML; the only markup this package injects is its own icon set.

## Redaction

The redaction tool draws an opaque mask into the document, and export rasterises
the document before encoding — so the covered pixels are **absent from the
exported file**, not merely hidden behind an overlay. The browser suite asserts
this by reading the exported PNG back.

Two honest limits, stated because overclaiming here is how people get hurt:

- The original file the user picked is untouched. If your application uploads
  both, redaction has bought you nothing.
- Blur and pixelate modes are not shipped yet. When they are, they will be
  documented as obfuscation, not removal — blurred text can sometimes be
  recovered, and only the solid mask is safe for sensitive data.

## Privacy

- No telemetry, no analytics, no phone-home.
- Pixen makes no network requests of its own. The only fetch it performs is for a
  URL string you passed to `load()`.
- All decoding, editing and encoding happens in the browser.
- Any future AI features will run through adapters that call **your** backend or
  **your** provider key. Pixen will not proxy customer images.

## Reporting

Security reports: open a private advisory on the repository rather than a public
issue.
