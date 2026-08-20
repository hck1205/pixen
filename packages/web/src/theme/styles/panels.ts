/**
 * The surfaces that appear over the canvas: the inspector and its layer list,
 * the empty state, the drop zone, the busy pill, and the on-canvas text editor.
 *
 * Each is a thing that is sometimes there and sometimes not, which is what
 * separates them from `layout` — that decides where a panel would go, this
 * decides what it looks like when it arrives.
 */
export const panels = `
/* The on-canvas text editor: a real input dressed as the layer it stands in for. */
.text-input {
  position: absolute;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  resize: none;
  overflow: hidden;
  background: transparent;
  white-space: pre;
  caret-color: var(--pixen-accent);
  /* The layer underneath is hidden while editing, so this is the only copy. */
  z-index: 3;
}

.text-input[hidden] { display: none; }

.inspector {
  display: flex;
  /* Wraps rather than squashing: the adjust panel carries a dozen controls, and
     a single row shrank them until the labels overlapped. */
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  max-inline-size: min(760px, 100%);
  /* Bounded so a tall panel scrolls inside the chrome instead of growing it
     past the host, which is what the browser suite checks. */
  max-block-size: min(38vh, 260px);
  /* Measured against the editor's own box rather than the page's, so an editor
     in a short panel inside a tall window does not hand half its height to the
     inspector and leave the image nowhere to go. Engines without container
     queries drop this line and keep the viewport rule above. */
  max-block-size: min(38cqh, 260px);
  overflow-y: auto;
  scrollbar-width: thin;
}

/* Controls keep their own width; the row wraps around them. */
.inspector > * { flex: 0 0 auto; }

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
.field input[type="text"] { inline-size: 150px; }
.field input[type="number"] { inline-size: 72px; }

.field input[type="text"],
.field input[type="number"] {
  padding: 6px 8px;
  color: var(--pixen-text);
  background: rgba(127, 140, 170, 0.14);
  border: 1px solid var(--pixen-border);
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
}

/* The layer list spans the inspector rather than wrapping with the controls:
   it is a list, and a list read across three columns is not a list. */
.layer-list {
  flex: 1 1 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  inline-size: 100%;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: var(--pixen-radius-small);
}

.layer-row:hover { background: rgba(127, 140, 170, 0.1); }

/* The name takes the room the buttons do not, and is clipped rather than
   pushing them off the end. */
.layer-row .layer-name {
  flex: 1 1 auto;
  justify-content: flex-start;
  min-inline-size: 0;
  padding-inline: 8px;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
}

.layer-row .layer-name svg { flex: 0 0 auto; }

.readout {
  white-space: nowrap;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--pixen-text-muted);
  padding-inline: 6px;
}

.empty {
  position: absolute;
  inset: 0;
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
  /* Flat fallback first for engines without color-mix(). */
  background: rgba(79, 140, 255, 0.12);
  background: color-mix(in srgb, var(--pixen-accent) 12%, transparent);
  display: grid;
  place-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--pixen-text);
  pointer-events: none;
}

/* Shares the top row with the actions rather than floating over them: it used
   to be centred and absolutely positioned, which collided with the action
   cluster on any host under about 500px. An auto margin at its end pushes it to
   the start of the row and leaves the actions where they were. */
.busy {
  margin-inline-end: auto;
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
`;
