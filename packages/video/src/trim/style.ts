/**
 * How the strip looks.
 *
 * A stylesheet is a table, and a table belongs in a file of its own: it is read
 * when a colour is wrong and never when a behaviour is, so keeping it beside
 * the control meant scrolling past thirty lines of CSS to reach what a drag
 * does.
 *
 * Every colour is a custom property the host may set, so the strip wears
 * whatever theme the rest of the editor is wearing.
 */
const STYLE = `
.pixen-trim { display: grid; gap: 6px; min-width: 220px; }
.pixen-trim-track { position: relative; height: 26px; border-radius: 8px;
  background: rgb(var(--pixen-tint, 127 140 170) / 0.18); overflow: hidden; }
.pixen-trim-kept { position: absolute; top: 0; bottom: 0;
  background: var(--pixen-accent, #4f8cff); opacity: 0.45; }
.pixen-trim-mark { position: absolute; top: 0; bottom: 0; pointer-events: none;
  border-left: 2px solid var(--pixen-accent-contrast, #fff);
  border-right: 2px solid var(--pixen-accent-contrast, #fff);
  background: rgb(255 255 255 / 0.12); }
.pixen-trim input { position: absolute; inset: 0; width: 100%; margin: 0;
  appearance: none; background: none; pointer-events: none; }
.pixen-trim input::-webkit-slider-thumb { appearance: none; pointer-events: auto;
  width: 12px; height: 26px; border-radius: 4px; cursor: ew-resize;
  background: var(--pixen-accent-contrast, #fff); border: 1px solid var(--pixen-accent, #4f8cff); }
.pixen-trim input::-moz-range-thumb { pointer-events: auto; width: 12px; height: 26px;
  border-radius: 4px; cursor: ew-resize;
  background: var(--pixen-accent-contrast, #fff); border: 1px solid var(--pixen-accent, #4f8cff); }
.pixen-trim-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.pixen-trim-head { position: absolute; top: 0; bottom: 0; width: 2px; pointer-events: none;
  background: var(--pixen-accent-contrast, #fff); box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4); }
.pixen-trim-readout { font: 400 12px/1.4 system-ui, sans-serif; opacity: 0.75; }
`;

/** The stylesheet the strip needs, put into the element's shadow root. */
export function trimStyleElement(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = STYLE;
  return style;
}
