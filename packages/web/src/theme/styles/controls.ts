/**
 * The chrome's vocabulary: buttons, fields, inputs, dividers and readouts.
 *
 * One appearance for every control, so a new section of the inspector inherits
 * the product's look by using `button()` and `field()` rather than by carrying
 * styles of its own.
 */
export const controls = `
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

/* :focus first so engines without :focus-visible still show a ring, then the
   modern rule takes the ring away for pointer focus. */
button:focus { outline: 2px solid var(--pixen-accent); outline-offset: 2px; }
button:focus:not(:focus-visible) { outline: none; }
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
`;
