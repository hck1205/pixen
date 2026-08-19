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

Redaction rasterises into the exported pixels, not into an overlay: whatever a
mode does, it does it to the file. The browser suite proves it by exporting a
PNG, reading it back, and measuring the detail left in the region.

The three modes do **not** make the same promise:

| Mode | What it does | Safe for sensitive data |
| --- | --- | --- |
| `solid` (default) | Paints over the region. The original pixels are gone from the export | Yes |
| `pixelate` | Averages the region into blocks | No — obfuscation only |
| `blur` | Blurs the region | No — obfuscation only |

`solid` is the default because it is the only one that removes information.
Blurred and pixelated text can sometimes be recovered, especially when the
attacker knows the font, the wording, or the block size; treat both as visual
tidying, not as protection.

Two implementation notes that matter for the guarantee:

- `blur` and `pixelate` read the canvas back. A cross-origin source without CORS
  taints the canvas, and an engine without canvas filters cannot blur — **both
  fall back to the solid fill**, because a redaction that quietly does nothing is
  the one outcome that must never happen.
- The original file the user picked is untouched. If your application uploads
  both, redaction has bought you nothing.

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
