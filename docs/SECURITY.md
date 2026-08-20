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

The four modes do **not** make the same promise:

| Mode | What it does | Safe for sensitive data |
| --- | --- | --- |
| `solid` (default) | Paints over the region. The original pixels are gone from the export | Yes |
| `scramble` | Averages the region into blocks, then shuffles the blocks | No — obfuscation only |
| `pixelate` | Averages the region into blocks | No — obfuscation only |
| `blur` | Blurs the region | No — obfuscation only, and the weakest |

`solid` is the default because it is the only one that removes information.
Everything below it is ordered by how much work recovery takes, not by whether
recovery is possible:

- A **blur** is a linear filter with a known kernel. Given the radius, it can be
  partly undone by deconvolution. It is the weakest of the three.
- **Pixelating** averages each block, which is not invertible on its own — but
  it leaves the *arrangement*. An attacker who knows the font and the wording
  can render candidate text, pixelate it the same way, and compare block for
  block until it matches. This is a published attack, not a theoretical one.
- **Scrambling** averages the blocks and then permutes them, so a recovered
  block has nowhere to go: the arrangement that the comparison attack depends on
  is gone. The order is derived from the layer's own id, so the preview and the
  exported file always agree — which also means it is not a secret. Someone with
  the document can compute the same permutation and undo it.

Treat all three as visual tidying. If the pixels must not leave the browser,
use `solid`.

Two implementation notes that matter for the guarantee:

- Every mode except `solid` reads the canvas back. A cross-origin source without
  CORS taints the canvas, and an engine without canvas filters cannot blur —
  **all of them fall back to the solid fill**, because a redaction that quietly
  does nothing is the one outcome that must never happen.
- The strength is measured in image pixels and applied in device pixels, so it
  travels through the render transform. A rotated picture is redacted exactly as
  hard as an upright one.
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
