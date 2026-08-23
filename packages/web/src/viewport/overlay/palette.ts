/**
 * The overlay's colours, read from the element rather than baked in.
 *
 * Every one is a custom property a host can set, so the chrome drawn on the
 * canvas follows the theme the rest of the editor is wearing. The fallbacks
 * are what a page that sets none of them gets.
 */
export interface OverlayPalette {
  scrim: string;
  outline: string;
  grid: string;
  selection: string;
}

const FALLBACK_PALETTE: OverlayPalette = {
  scrim: "rgba(8, 9, 12, 0.62)",
  outline: "rgba(255, 255, 255, 0.95)",
  grid: "rgba(255, 255, 255, 0.28)",
  selection: "#4f8cff",
};

/** Reads the palette from the element's own custom properties, so themes apply. */
export function readOverlayPalette(styles: CSSStyleDeclaration): OverlayPalette {
  const read = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;
  return {
    scrim: read("--pixen-crop-scrim", FALLBACK_PALETTE.scrim),
    outline: read("--pixen-crop-outline", FALLBACK_PALETTE.outline),
    grid: read("--pixen-grid-line", FALLBACK_PALETTE.grid),
    selection: read("--pixen-selection", FALLBACK_PALETTE.selection),
  };
}
