/**
 * Pixen's UI language, deliberately its own: a floating vertical tool rail, a
 * contextual inspector docked to the bottom of the canvas, and a quiet action
 * cluster in the corner. On narrow screens the inspector becomes a sheet and the
 * rail lies down along the bottom edge.
 *
 * Customisation is layered: CSS custom properties for colour and shape, `::part`
 * for structural tweaks, and named slots for replacing controls outright.
 */
export const styles = `
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
  --pixen-shadow: 0 10px 26px rgba(20, 22, 27, 0.16);
  --pixen-crop-scrim: rgba(240, 242, 246, 0.7);
  --pixen-crop-outline: rgba(20, 22, 27, 0.9);
  --pixen-grid-line: rgba(20, 22, 27, 0.28);
}

:host([hidden]) { display: none; }

/* Our own display rules outrank the UA rule for [hidden], so state it once here
   rather than repeating a :not([hidden]) guard on every overlay. */
[hidden] { display: none !important; }

.root {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  display: grid;
  background: var(--pixen-surface-sunken);
}

canvas {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  grid-area: 1 / 1;
  touch-action: none;
}

.layer {
  grid-area: 1 / 1;
  position: relative;
  pointer-events: none;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: 12px;
  gap: 12px;
}

/* The layout rows span the whole canvas, so only the floating chrome itself may
   take pointer events — otherwise an invisible row swallows every drag. */
.layer > * { pointer-events: none; }
.cluster, .empty, ::slotted(*) { pointer-events: auto; }

.top {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: var(--pixen-gap);
}

.middle {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-block-size: 0;
}

.bottom {
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.cluster {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px;
  background: var(--pixen-surface-raised);
  border: 1px solid var(--pixen-border);
  border-radius: var(--pixen-radius);
  box-shadow: var(--pixen-shadow);
  backdrop-filter: blur(14px);
}

.rail { flex-direction: column; }

button {
  appearance: none;
  border: 0;
  margin: 0;
  padding: 0;
  font: inherit;
  color: var(--pixen-text);
  background: transparent;
  border-radius: var(--pixen-radius-small);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-inline-size: var(--pixen-control-size);
  block-size: var(--pixen-control-size);
  transition: background-color 120ms ease, color 120ms ease;
}

button svg { inline-size: 20px; block-size: 20px; }

button:hover:not(:disabled) { background: rgba(127, 140, 170, 0.18); }
button:focus-visible { outline: 2px solid var(--pixen-accent); outline-offset: 2px; }
button:disabled { opacity: 0.35; cursor: default; }
button[aria-pressed="true"], button.active {
  background: var(--pixen-accent);
  color: var(--pixen-accent-contrast);
}

button.text { padding-inline: 12px; font-size: 13px; font-weight: 550; }
button.primary { background: var(--pixen-accent); color: var(--pixen-accent-contrast); }
button.primary:hover:not(:disabled) { filter: brightness(1.08); }

.divider {
  inline-size: 1px;
  block-size: 22px;
  background: var(--pixen-border);
  margin-inline: 2px;
}
.rail .divider { inline-size: 22px; block-size: 1px; margin: 2px 0; }

.inspector {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  max-inline-size: min(760px, 100%);
  overflow-x: auto;
  scrollbar-width: thin;
}

.inspector:empty { display: none; }

.field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--pixen-text-muted);
  white-space: nowrap;
}

.field input[type="range"] { inline-size: 104px; accent-color: var(--pixen-accent); }
.field input[type="color"] {
  inline-size: 26px;
  block-size: 26px;
  padding: 0;
  border: 1px solid var(--pixen-border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
.field input[type="text"] {
  inline-size: 150px;
  padding: 6px 8px;
  color: var(--pixen-text);
  background: rgba(127, 140, 170, 0.14);
  border: 1px solid var(--pixen-border);
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
}

.readout {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--pixen-text-muted);
  padding-inline: 6px;
}

.empty {
  grid-area: 1 / 1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  text-align: center;
  padding: 24px;
  color: var(--pixen-text-muted);
}
.empty h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--pixen-text); }
.empty p { margin: 0; font-size: 13px; max-inline-size: 34ch; }
.empty svg { inline-size: 34px; block-size: 34px; opacity: 0.6; }

.dropzone {
  position: absolute;
  inset: 8px;
  border: 2px dashed var(--pixen-accent);
  border-radius: var(--pixen-radius);
  background: color-mix(in srgb, var(--pixen-accent) 12%, transparent);
  display: grid;
  place-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--pixen-text);
  pointer-events: none;
}

.busy {
  position: absolute;
  inset-block-start: 12px;
  inset-inline-start: 50%;
  translate: -50% 0;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 999px;
  background: var(--pixen-surface-raised);
  border: 1px solid var(--pixen-border);
  box-shadow: var(--pixen-shadow);
}

.sr-only {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .layer { padding: 8px; grid-template-rows: auto 1fr auto; }
  .middle { align-items: flex-end; }
  .rail { flex-direction: row; }
  .inspector { max-inline-size: 100%; inline-size: 100%; }
  .bottom { align-items: stretch; }
  .bottom .cluster { inline-size: 100%; border-radius: var(--pixen-radius); }
}

@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
}
`;
