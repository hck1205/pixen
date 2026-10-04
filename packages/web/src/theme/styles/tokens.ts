/**
 * The custom properties a host restyles Pixen with, and the two themes built
 * from them.
 *
 * Every colour, radius and size the rest of the sheet uses is named here, so a
 * host changes the product's appearance by setting properties rather than by
 * fighting selectors — and a value that appears twice in the sheet is a token
 * that was missing.
 */
export const tokens = `
:host {
  --pixen-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --pixen-surface: #16181d;
  --pixen-surface-raised: rgba(38, 41, 50, 0.92);
  --pixen-surface-sunken: #0d0e12;
  --pixen-text: #f2f4f8;
  --pixen-text-muted: #a2a8b8;
  --pixen-accent: #4f8cff;
  --pixen-accent-contrast: #ffffff;
  --pixen-border: rgba(255, 255, 255, 0.10);
  /* The tint a control takes on hover and a field takes as its fill, as colour
     channels rather than a colour: the three places that use it want three
     different strengths of the same wash, and a host restyling it wants to
     change all three at once. */
  --pixen-tint: 127 140 170;
  --pixen-radius: 12px;
  --pixen-radius-small: 8px;
  --pixen-gap: 8px;
  --pixen-control-size: 38px;
  --pixen-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  --pixen-crop-outline: rgba(255, 255, 255, 0.95);
  --pixen-crop-scrim: rgba(8, 9, 12, 0.62);
  --pixen-grid-line: rgba(255, 255, 255, 0.28);
  --pixen-selection: #4f8cff;

  display: block;
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  min-block-size: 320px;
  font-family: var(--pixen-font);
  color: var(--pixen-text);
  background: var(--pixen-surface-sunken);
  border-radius: var(--pixen-radius);
  overflow: hidden;
  contain: layout paint;
  /* A size container, so the chrome responds to the editor's own box rather
     than the viewport's: an editor can be 360px wide inside a 1400px page, and
     a viewport media query would dress it as a desktop. */
  container-type: size;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

:host([theme="light"]) {
  --pixen-surface: #f6f7f9;
  --pixen-surface-raised: rgba(255, 255, 255, 0.94);
  --pixen-surface-sunken: #e9ebef;
  --pixen-text: #14161b;
  --pixen-text-muted: #5c6474;
  --pixen-border: rgba(20, 22, 27, 0.12);
  /* Its own, rather than the dark theme's: a wash lifted off a dark surface
     reads as haze on a light one. */
  --pixen-tint: 20 22 27;
  --pixen-shadow: 0 10px 26px rgba(20, 22, 27, 0.16);
  --pixen-crop-scrim: rgba(240, 242, 246, 0.7);
  --pixen-crop-outline: rgba(20, 22, 27, 0.9);
  --pixen-grid-line: rgba(20, 22, 27, 0.28);
}

:host([hidden]) { display: none; }

/* Our own display rules outrank the UA rule for [hidden], so state it once here
   rather than repeating a :not([hidden]) guard on every overlay. */
[hidden] { display: none !important; }
`;
